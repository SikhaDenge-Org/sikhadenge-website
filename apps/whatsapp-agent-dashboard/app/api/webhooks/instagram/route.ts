import { NextResponse } from "next/server";

import { processSocialWebhookAgentBridge } from "../../../../lib/agent/social-webhook-agent-bridge";
import {
  instagramCommentAutomationEnabled,
  processInstagramCommentAutomation,
} from "../../../../lib/instagram/comment-automation-runtime";
import { syncInstagramProfilesFromWebhook } from "../../../../lib/instagram/profile-sync";
import { processInstagramWebhook } from "../../../../lib/instagram/webhook-processor";
import {
  getInstagramAppSecret,
  getInstagramVerifyToken,
  getInstagramWebhookMaxBytes,
} from "../../../../lib/meta/config";
import { verifyMetaSignature } from "../../../../lib/meta/signature";
import {
  releasePersistedWebhookReplay,
  reservePersistedWebhookReplay,
} from "@/modules/channels/core/security/prisma-webhook-replay";
import { recordMetaWebhookEvidence } from "@/modules/integrations/infrastructure/prisma-integration-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function instagramAccountIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const root = payload as Record<string, unknown>;
  if (root.object !== "instagram") return [];
  const entries = Array.isArray(root.entry) ? root.entry : [];
  const ids = new Set<string>();
  for (const value of entries) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const id = (value as Record<string, unknown>).id;
    if (typeof id === "string" && id.trim()) ids.add(id.trim());
  }
  return [...ids];
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  let expectedToken: string;
  try {
    expectedToken = getInstagramVerifyToken();
  } catch {
    return NextResponse.json(
      { error: "Instagram webhook verification is not configured." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  if (mode !== "subscribe" || !challenge || token !== expectedToken) {
    return NextResponse.json(
      { error: "Instagram webhook verification failed." },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: {
      ...NO_STORE_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > getInstagramWebhookMaxBytes()) {
    return NextResponse.json(
      { error: "Instagram webhook payload is too large." },
      { status: 413, headers: NO_STORE_HEADERS },
    );
  }

  let appSecret: string;
  try {
    appSecret = getInstagramAppSecret();
  } catch {
    return NextResponse.json(
      { error: "Instagram webhook signature verification is not configured." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  const signatureHeader = request.headers.get("x-hub-signature-256");
  const signatureIsValid = verifyMetaSignature({
    rawBody,
    signatureHeader,
    appSecret,
  });
  if (!signatureIsValid) {
    return NextResponse.json(
      { error: "Invalid Instagram webhook signature." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json(
      { error: "Instagram webhook payload is not valid JSON." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  let replay: Awaited<ReturnType<typeof reservePersistedWebhookReplay>>;
  try {
    replay = await reservePersistedWebhookReplay({
      channel: "INSTAGRAM",
      rawBody,
      signatureHeader,
    });
  } catch {
    return NextResponse.json(
      { error: "Instagram replay protection is unavailable." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  if (replay.duplicate) {
    return NextResponse.json(
      { received: true, duplicate: true },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  }

  try {
    for (const accountId of instagramAccountIds(payload)) {
      await recordMetaWebhookEvidence({
        channel: "INSTAGRAM",
        externalAccountId: accountId,
      }).catch(() => undefined);
    }

    const result = await processInstagramWebhook(payload, rawBody);
    const commentAutomation = instagramCommentAutomationEnabled()
      ? await processInstagramCommentAutomation(payload)
      : null;
    await syncInstagramProfilesFromWebhook(payload);

    let agent: Awaited<ReturnType<typeof processSocialWebhookAgentBridge>> | null = null;
    try {
      agent = await processSocialWebhookAgentBridge({
        payload,
        channel: "instagram",
      });
    } catch {
      agent = {
        matched: 0,
        analyzed: 0,
        queued: 0,
        sent: 0,
        handoffs: 0,
        skipped: 0,
        failed: 1,
      };
    }

    return NextResponse.json(
      { received: true, ...result, commentAutomation, agent },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch {
    await releasePersistedWebhookReplay(replay).catch(() => undefined);
    return NextResponse.json(
      { error: "Instagram webhook processing failed and can be retried." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
