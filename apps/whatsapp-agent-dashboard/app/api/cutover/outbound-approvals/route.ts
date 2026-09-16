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
