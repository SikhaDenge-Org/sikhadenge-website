import { randomUUID } from "node:crypto";
import { MessageDirection, MessageStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { getCurrentDashboardUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { readLegacyWhatsAppMappingMetadata } from "@/modules/channels/whatsapp/application/legacy-identity-mapping";
import { parseControlledLaunchApprovedFlowProof } from "@/modules/release/application/controlled-launch-approved-flow";

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

async function hasWorkspaceMembership(userId: string, workspaceId: string) {
  return Boolean(await prisma.engageWorkspaceMembership.findFirst({
    where: { userId, workspaceId, isActive: true, user: { isActive: true } },
    select: { id: true },
  }));
}
async function resolveCandidate(messageId: string) {
  const message = await prisma.whatsAppMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      direction: true,
      status: true,
      rawPayload: true,
      conversation: { select: { contact: { select: { waId: true, displayName: true, profileName: true, metadata: true } } } },
    },
  });
  if (!message || message.direction !== MessageDirection.OUTBOUND || message.status !== MessageStatus.QUEUED) return null;
  const mapping = readLegacyWhatsAppMappingMetadata(message.conversation.contact.metadata);
  const proof = parseControlledLaunchApprovedFlowProof(message.rawPayload);
  if (!mapping || !proof) return null;
  return { message, mapping, proof };
}

async function requireEligibleState(workspaceId: string, connectionId: string) {
  const state = await prisma.engageControlledLaunchState.findUnique({ where: { workspaceId } });
  if (!state || state.mode !== "FULL_AUTOPILOT_FOR_APPROVED_FLOWS" || state.writePolicy !== "APPROVED_FLOWS_ONLY" || !state.externalWritesAllowed) {
    throw new Error("Current controlled-launch state is not eligible for approved-flow writes.");
  }
  const scope = state.scope as { workspaceId?: string; connectedAccountIds?: string[]; enabledChannels?: string[]; externalWritesRequested?: boolean };
  const channels = Array.isArray(scope.enabledChannels) ? scope.enabledChannels.map((value) => value.trim().toUpperCase()) : [];
  if (scope.workspaceId !== workspaceId || scope.externalWritesRequested !== true || !Array.isArray(scope.connectedAccountIds) || !scope.connectedAccountIds.includes(connectionId) || !channels.includes("WHATSAPP")) {
    throw new Error("Current persisted controlled-launch scope does not permit this WhatsApp connection.");
  }
  return state;
}
export async function GET() {
  const user = await requirePlatformAdmin();
  if (!user) return errorResponse(403, "AUTH_REQUIRED", "Platform admin authentication required.");
  const memberships = await prisma.engageWorkspaceMembership.findMany({
    where: { userId: user.id, isActive: true, user: { isActive: true } },
    select: { workspaceId: true },
  });
  const workspaceIds = memberships.map((item) => item.workspaceId);
  if (workspaceIds.length === 0) return NextResponse.json({ success: true, candidates: [], approvals: [] });
  const queued = await prisma.whatsAppMessage.findMany({
    where: { direction: MessageDirection.OUTBOUND, status: MessageStatus.QUEUED },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, rawPayload: true, messageTimestamp: true,
      conversation: { select: { contact: { select: { waId: true, displayName: true, profileName: true, metadata: true } } } },
    },
  });
  const candidates = queued.flatMap((message) => {
    const mapping = readLegacyWhatsAppMappingMetadata(message.conversation.contact.metadata);
    const proof = parseControlledLaunchApprovedFlowProof(message.rawPayload);
    if (!mapping || !proof || !workspaceIds.includes(mapping.workspaceId)) return [];
    return [{ messageId: message.id, workspaceId: mapping.workspaceId, connectionId: mapping.connectionId,
      recipient: message.conversation.contact.displayName || message.conversation.contact.profileName || message.conversation.contact.waId,
      waId: message.conversation.contact.waId, queuedAt: message.messageTimestamp, ...proof }];
  });
  const groups = await Promise.all(workspaceIds.map((workspaceId) => prisma.$queryRaw<Array<{
    id: string; workspaceId: string; connectionId: string; controlledLaunchStateVersion: number;
    flowType: string; flowId: string; flowVersion: number; approvedByUserId: string; reason: string;
    approvedAt: Date; revokedAt: Date | null; revokedByUserId: string | null; revokeReason: string | null; createdAt: Date;
  }>>`
    SELECT "id", "workspaceId", "connectionId", "controlledLaunchStateVersion", "flowType", "flowId", "flowVersion",
           "approvedByUserId", "reason", "approvedAt", "revokedAt", "revokedByUserId", "revokeReason", "createdAt"
    FROM "EngageControlledLaunchApprovedFlow"
    WHERE "workspaceId" = ${workspaceId}
    ORDER BY "createdAt" DESC
    LIMIT 50
  `));
  const approvals = groups.flat().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 100).map((item) => ({
    ...item,
    status: item.revokedAt ? "REVOKED" : "ACTIVE",
  }));
  return NextResponse.json({ success: true, candidates, approvals });
}

export async function POST(req: NextRequest) {
  const user = await requirePlatformAdmin();
  if (!user) return errorResponse(403, "AUTH_REQUIRED", "Platform admin authentication required.");
  let body: unknown;
  try { body = await req.json(); } catch { return errorResponse(400, "INVALID_JSON", "A JSON request body is required."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return errorResponse(400, "INVALID_BODY", "Request body must be an object.");
  const input = body as Record<string, unknown>;
  const unexpected = Object.keys(input).filter((key) => !["messageId", "reason"].includes(key));
  if (unexpected.length > 0) return errorResponse(400, "UNSUPPORTED_FIELDS", `Unsupported approval fields: ${unexpected.join(", ")}`);
  const messageId = typeof input.messageId === "string" ? input.messageId.trim() : "";
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!messageId) return errorResponse(400, "MESSAGE_REQUIRED", "messageId is required.");
  if (!reason) return errorResponse(400, "REASON_REQUIRED", "reason is required.");
  try {
    const candidate = await resolveCandidate(messageId);
    if (!candidate) return errorResponse(404, "FLOW_CANDIDATE_NOT_FOUND", "Eligible queued approved-flow candidate not found.");
    if (!await hasWorkspaceMembership(user.id, candidate.mapping.workspaceId)) return errorResponse(403, "WORKSPACE_FORBIDDEN", "Workspace membership required.");
    const state = await requireEligibleState(candidate.mapping.workspaceId, candidate.mapping.connectionId);
    const id = randomUUID();
    const rows = await prisma.$queryRaw<Array<{ id: string; approvedAt: Date }>>`
      INSERT INTO "EngageControlledLaunchApprovedFlow" (
        "id", "workspaceId", "connectionId", "controlledLaunchStateVersion", "flowType", "flowId", "flowVersion", "approvedByUserId", "reason"
      ) VALUES (
        ${id}, ${candidate.mapping.workspaceId}, ${candidate.mapping.connectionId}, ${state.version},
        ${candidate.proof.flowType}, ${candidate.proof.flowId}, ${candidate.proof.flowVersion}, ${user.id}, ${reason}
      )
      ON CONFLICT DO NOTHING
      RETURNING "id", "approvedAt"
    `;
    if (!rows[0]) return errorResponse(409, "APPROVED_FLOW_ALREADY_ACTIVE", "This exact flow is already approved for the current controlled-launch state version.");
    return NextResponse.json({ success: true, approval: { id: rows[0].id, approvedAt: rows[0].approvedAt,
      workspaceId: candidate.mapping.workspaceId, connectionId: candidate.mapping.connectionId, controlledLaunchStateVersion: state.version, ...candidate.proof } }, { status: 201 });
  } catch (error) {
    return errorResponse(400, "APPROVED_FLOW_APPROVAL_FAILED", error instanceof Error ? error.message : "Approved-flow approval failed.");
  }
}
export async function DELETE(req: NextRequest) {
  const user = await requirePlatformAdmin();
  if (!user) return errorResponse(403, "AUTH_REQUIRED", "Platform admin authentication required.");
  let body: unknown;
  try { body = await req.json(); } catch { return errorResponse(400, "INVALID_JSON", "A JSON request body is required."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return errorResponse(400, "INVALID_BODY", "Request body must be an object.");
  const input = body as Record<string, unknown>;
  const unexpected = Object.keys(input).filter((key) => !["approvalId", "reason"].includes(key));
  if (unexpected.length > 0) return errorResponse(400, "UNSUPPORTED_FIELDS", `Unsupported revocation fields: ${unexpected.join(", ")}`);
  const approvalId = typeof input.approvalId === "string" ? input.approvalId.trim() : "";
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!approvalId) return errorResponse(400, "APPROVAL_REQUIRED", "approvalId is required.");
  if (!reason) return errorResponse(400, "REASON_REQUIRED", "Revocation reason is required.");
  const rows = await prisma.$queryRaw<Array<{ id: string; workspaceId: string; revokedAt: Date | null }>>`
    SELECT "id", "workspaceId", "revokedAt"
    FROM "EngageControlledLaunchApprovedFlow"
    WHERE "id" = ${approvalId}
    LIMIT 1
  `;
  const approval = rows[0];
  if (!approval) return errorResponse(404, "APPROVAL_NOT_FOUND", "Approved-flow approval not found.");
  if (!await hasWorkspaceMembership(user.id, approval.workspaceId)) return errorResponse(403, "WORKSPACE_FORBIDDEN", "Workspace membership required.");
  if (approval.revokedAt) return errorResponse(409, "APPROVAL_NOT_ACTIVE", "Only an active approved-flow approval can be revoked.");
  const updated = await prisma.$queryRaw<Array<{ id: string; revokedAt: Date; revokedByUserId: string; revokeReason: string }>>`
    UPDATE "EngageControlledLaunchApprovedFlow"
    SET "revokedAt" = CURRENT_TIMESTAMP, "revokedByUserId" = ${user.id}, "revokeReason" = ${reason}
    WHERE "id" = ${approvalId} AND "revokedAt" IS NULL
    RETURNING "id", "revokedAt", "revokedByUserId", "revokeReason"
  `;
  if (!updated[0]) return errorResponse(409, "APPROVAL_NOT_ACTIVE", "Approved-flow approval is no longer active.");
  return NextResponse.json({ success: true, approval: updated[0] });
}
