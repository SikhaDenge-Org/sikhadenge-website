import { MessageDirection, MessageStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { getCurrentDashboardUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { readLegacyWhatsAppMappingMetadata } from "@/modules/channels/whatsapp/application/legacy-identity-mapping";
import {
  approveControlledLaunchOutbound,
  ControlledLaunchOutboundApprovalError,
} from "@/modules/release/application/controlled-launch-outbound-approval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, code, message }, { status });
}

async function requirePlatformAdmin() {
  const user = await getCurrentDashboardUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}
function boundedTtl(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ControlledLaunchOutboundApprovalError(
      "APPROVAL_INVALID_TTL",
      "ttlMs must be an integer when provided.",
    );
  }
  return value;
}

async function resolveServerAuthoritativeScope(messageId: string) {
  const message = await prisma.whatsAppMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      conversation: {
        select: {
          contact: { select: { metadata: true } },
        },
      },
    },
  });
  if (!message) return null;
  const mapping = readLegacyWhatsAppMappingMetadata(
    message.conversation.contact.metadata,
  );
  if (!mapping) {
    throw new ControlledLaunchOutboundApprovalError(
      "APPROVAL_SCOPE_MISMATCH",
      "Persisted WhatsApp workspace/connection mapping is missing for this queued message.",
    );
  }
  return {
    messageId: message.id,
    workspaceId: mapping.workspaceId,
    connectionId: mapping.connectionId,
  };
}

export async function GET() {
  const user = await requirePlatformAdmin();
  if (!user) return errorResponse(403, "AUTH_REQUIRED", "Platform admin authentication required.");

  const queued = await prisma.whatsAppMessage.findMany({
    where: { direction: MessageDirection.OUTBOUND, status: MessageStatus.QUEUED },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: {
      id: true, type: true, actor: true, text: true, filename: true, messageTimestamp: true,
      conversation: { select: { contact: { select: { waId: true, displayName: true, profileName: true, metadata: true } } } },
    },
  });

  const mapped = queued.flatMap((message) => {
    const mapping = readLegacyWhatsAppMappingMetadata(message.conversation.contact.metadata);
    return mapping ? [{ message, mapping }] : [];
  });
  const workspaceIds = [...new Set(mapped.map(({ mapping }) => mapping.workspaceId))];
  const memberships = workspaceIds.length === 0 ? [] : await prisma.engageWorkspaceMembership.findMany({
    where: { userId: user.id, isActive: true, workspaceId: { in: workspaceIds }, user: { isActive: true } },
    select: { workspaceId: true },
  });
  const allowed = new Set(memberships.map((membership) => membership.workspaceId));

  return NextResponse.json({
    success: true,
    candidates: mapped.filter(({ mapping }) => allowed.has(mapping.workspaceId)).map(({ message, mapping }) => ({
      messageId: message.id,
      type: message.type,
      actor: message.actor,
      preview: message.text?.slice(0, 180) || message.filename || message.type,
      recipient: message.conversation.contact.displayName || message.conversation.contact.profileName || message.conversation.contact.waId,
      waId: message.conversation.contact.waId,
      workspaceId: mapping.workspaceId,
      connectionId: mapping.connectionId,
      queuedAt: message.messageTimestamp,
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await requirePlatformAdmin();
  if (!user) {
    return errorResponse(
      403,
      "AUTH_REQUIRED",
      "Platform admin authentication required.",
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "A JSON request body is required.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse(400, "INVALID_BODY", "Request body must be an object.");
  }

  const input = body as Record<string, unknown>;
  const unexpected = Object.keys(input).filter(
    (key) => !["messageId", "reason", "ttlMs"].includes(key),
  );
  if (unexpected.length > 0) {
    return errorResponse(
      400,
      "UNSUPPORTED_FIELDS",
      `Unsupported approval fields: ${unexpected.join(", ")}`,
    );
  }

  const messageId = typeof input.messageId === "string" ? input.messageId.trim() : "";
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!messageId) return errorResponse(400, "MESSAGE_REQUIRED", "messageId is required.");
  if (!reason) return errorResponse(400, "REASON_REQUIRED", "reason is required.");
  try {
    const scope = await resolveServerAuthoritativeScope(messageId);
    if (!scope) {
      return errorResponse(404, "MESSAGE_NOT_FOUND", "Queued outbound message not found.");
    }
    const approval = await approveControlledLaunchOutbound({
      ...scope,
      approvedByUserId: user.id,
      reason,
      ttlMs: boundedTtl(input.ttlMs),
    });

    return NextResponse.json(
      {
        success: true,
        approval: {
          id: approval.id,
          messageId: approval.messageId,
          approvedAt: approval.approvedAt,
          expiresAt: approval.expiresAt,
          controlledLaunchStateVersion: approval.controlledLaunchStateVersion,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Outbound approval failed.";
    const code = error instanceof ControlledLaunchOutboundApprovalError
      ? error.code
      : "OUTBOUND_APPROVAL_FAILED";
    return errorResponse(400, code, message);
  }
}
