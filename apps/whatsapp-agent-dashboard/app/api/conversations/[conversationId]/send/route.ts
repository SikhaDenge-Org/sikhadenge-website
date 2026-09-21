import { DashboardRole, MessageActor } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../../../lib/auth/session";
import {
  dispatchOutboundMessage,
  queueOutboundMessage,
} from "../../../../../lib/outbound/outbound-service";
import type {
  OutboundContent,
  OutboundMediaType,
} from "../../../../../lib/outbound/types";
import { assertManualSendOwnership } from "../../../../../lib/team/team-chat-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
  DashboardRole.COUNSELOR,
]);

const MEDIA_TYPES = new Set<OutboundMediaType>([
  "image",
  "document",
  "video",
  "audio",
]);

type SendPayload = {
  kind?: unknown;
  text?: unknown;
  templateId?: unknown;
  components?: unknown;
  replyToMetaMessageId?: unknown;
  idempotencyKey?: unknown;
  assetId?: unknown;
  mediaType?: unknown;
  caption?: unknown;
  filename?: unknown;
};

export async function POST(
  request: Request,
  context: { params: { conversationId: string } },
) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!ALLOWED_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  }

  let payload: SendPayload;
  try {
    payload = (await request.json()) as SendPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const kind = typeof payload.kind === "string" ? payload.kind.toLowerCase() : "";
  const idempotencyKey =
    typeof payload.idempotencyKey === "string"
      ? payload.idempotencyKey.trim()
      : "";
  if (!idempotencyKey || idempotencyKey.length > 200) {
    return NextResponse.json(
      { error: "A 1-200 character idempotencyKey is required." },
      { status: 400 },
    );
  }

  let content: OutboundContent;
  if (kind === "text") {
    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    if (!text || text.length > 4_096) {
      return NextResponse.json(
        { error: "Text must contain 1-4,096 characters." },
        { status: 400 },
      );
    }
    content = {
      kind: "text",
      text,
      replyToMetaMessageId:
        typeof payload.replyToMetaMessageId === "string"
          ? payload.replyToMetaMessageId.trim().slice(0, 300) || null
          : null,
    };
  } else if (kind === "template") {
    const templateId =
      typeof payload.templateId === "string" ? payload.templateId.trim() : "";
    if (!templateId) {
      return NextResponse.json(
        { error: "templateId is required for template messages." },
        { status: 400 },
      );
    }
    content = {
      kind: "template",
      templateId,
      components: Array.isArray(payload.components) ? payload.components : [],
    };
  } else if (kind === "media") {
    const assetId = typeof payload.assetId === "string" ? payload.assetId.trim() : "";
    const mediaType =
      typeof payload.mediaType === "string"
        ? (payload.mediaType.trim().toLowerCase() as OutboundMediaType)
        : ("" as OutboundMediaType);
    if (!/^[a-f0-9]{32}$/.test(assetId)) {
      return NextResponse.json({ error: "A valid assetId is required." }, { status: 400 });
    }
    if (!MEDIA_TYPES.has(mediaType)) {
      return NextResponse.json(
        { error: "mediaType must be image, document, video, or audio." },
        { status: 400 },
      );
    }
    const caption =
      typeof payload.caption === "string" ? payload.caption.trim().slice(0, 1_024) : "";
    const filename =
      typeof payload.filename === "string" ? payload.filename.trim().slice(0, 180) : "";
    content = {
      kind: "media",
      assetId,
      mediaType,
      caption: caption || null,
      filename: filename || null,
      replyToMetaMessageId:
        typeof payload.replyToMetaMessageId === "string"
          ? payload.replyToMetaMessageId.trim().slice(0, 300) || null
          : null,
    };
  } else {
    return NextResponse.json(
      { error: "kind must be text, template, or media." },
      { status: 400 },
    );
  }

  try {
    await assertManualSendOwnership({
      conversationId: context.params.conversationId,
      actor: { id: user.id, role: user.role },
    });

    const queued = await queueOutboundMessage({
      conversationId: context.params.conversationId,
      actor: MessageActor.COUNSELOR,
      sentById: user.id,
      content,
      idempotencyKey,
    });

    let dispatch = null;
    let dispatchError: string | null = null;
    if (queued.message?.id && !queued.duplicate) {
      try {
        dispatch = await dispatchOutboundMessage(queued.message.id);
      } catch (error) {
        dispatchError = error instanceof Error ? error.message : "Meta delivery failed.";
      }
    }

    return NextResponse.json(
      {
        ...queued,
        outboundSent: dispatch?.outboundSent ?? false,
        dispatchStatus: dispatch?.status ?? queued.message?.status ?? null,
        dispatchMode: dispatch?.mode ?? null,
        dispatchError,
      },
      {
        status: queued.duplicate ? 200 : 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Queueing failed.";
    const status = detail.includes("not found")
      ? 404
      : detail.includes("owned") || detail.includes("Claim") || detail.includes("Human mode")
        ? 409
        : 422;
    return NextResponse.json({ error: detail, outboundSent: false }, { status });
  }
}
