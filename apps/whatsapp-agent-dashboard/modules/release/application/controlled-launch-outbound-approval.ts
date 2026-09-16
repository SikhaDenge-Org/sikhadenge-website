import { createHash, randomUUID } from "node:crypto";
import { MessageDirection, MessageStatus, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { readLegacyWhatsAppMappingMetadata } from "@/modules/channels/whatsapp/application/legacy-identity-mapping";

export const OUTBOUND_APPROVAL_MAX_TTL_MS = 30 * 60 * 1_000;

export type ControlledLaunchOutboundApprovalRecord = {
  id: string;
  workspaceId: string;
  connectionId: string;
  messageId: string;
  contentFingerprint: string;
  controlledLaunchStateVersion: number;
  approvedByUserId: string;
  reason: string;
  approvedAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

export type OutboundApprovalContext = {
  workspaceId: string;
  connectionId: string;
  messageId: string;
  contentFingerprint: string;
  controlledLaunchStateVersion: number;
};

export type OutboundApprovalDecision =
  | { allowed: true; approvalId: string }
  | {
      allowed: false;
      code:
        | "APPROVAL_MISSING"
        | "APPROVAL_SCOPE_MISMATCH"
        | "APPROVAL_STATE_VERSION_MISMATCH"
        | "APPROVAL_CONTENT_MISMATCH"
        | "APPROVAL_EXPIRED"
        | "APPROVAL_CONSUMED"
        | "APPROVAL_REVOKED";
      reason: string;
    };

export class ControlledLaunchOutboundApprovalError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ControlledLaunchOutboundApprovalError";
    this.code = code;
  }
}

function nonEmpty(value: string, label: string, maximum = 500): string {
  const normalized = value.trim().slice(0, maximum);
  if (!normalized) throw new ControlledLaunchOutboundApprovalError("APPROVAL_INVALID", `${label} is required.`);
  return normalized;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

type ApprovalMessageSnapshot = { id: string; direction: string; status: string; type: string; text: string | null; mediaId: string | null; mediaUrl: string | null; mimeType: string | null; filename: string | null; replyToMetaMessageId: string | null; rawPayload: unknown; messageTimestamp: Date; recipientWaId: string; };

export function fingerprintQueuedOutboundMessage(input: ApprovalMessageSnapshot): string {
  return createHash("sha256").update(stableJson({ id: input.id, direction: input.direction, status: input.status, type: input.type, text: input.text, mediaId: input.mediaId, mediaUrl: input.mediaUrl, mimeType: input.mimeType, filename: input.filename, replyToMetaMessageId: input.replyToMetaMessageId, rawPayload: input.rawPayload, messageTimestamp: input.messageTimestamp.toISOString(), recipientWaId: input.recipientWaId })).digest("hex");
}

async function currentQueuedMessageFingerprint(client: Prisma.TransactionClient | typeof prisma, messageId: string): Promise<string> {
  const message = await client.whatsAppMessage.findUnique({ where: { id: messageId }, select: { id: true, direction: true, status: true, type: true, text: true, mediaId: true, mediaUrl: true, mimeType: true, filename: true, replyToMetaMessageId: true, rawPayload: true, messageTimestamp: true, conversation: { select: { contact: { select: { waId: true } } } } } });
  if (!message || message.direction !== MessageDirection.OUTBOUND || message.status !== MessageStatus.QUEUED) throw new ControlledLaunchOutboundApprovalError("APPROVAL_MESSAGE_INVALID", "Approval target must remain an existing QUEUED outbound WhatsApp message.");
  return fingerprintQueuedOutboundMessage({ ...message, recipientWaId: message.conversation.contact.waId });
}

export function evaluateOutboundApproval(input: {
  context: OutboundApprovalContext;
  approval: ControlledLaunchOutboundApprovalRecord | null;
  now?: Date;
}): OutboundApprovalDecision {
  const { context, approval } = input;
  const now = input.now ?? new Date();
  if (!approval) {
    return { allowed: false, code: "APPROVAL_MISSING", reason: "No persisted human approval exists for this queued outbound message." };
  }
  if (
    approval.workspaceId !== context.workspaceId ||
    approval.connectionId !== context.connectionId ||
    approval.messageId !== context.messageId
  ) {
    return { allowed: false, code: "APPROVAL_SCOPE_MISMATCH", reason: "Persisted approval does not match the outbound workspace, connection, and message." };
  }
  if (approval.contentFingerprint !== context.contentFingerprint) {
    return { allowed: false, code: "APPROVAL_CONTENT_MISMATCH", reason: "Queued outbound content changed after human approval." };
  }
  if (approval.controlledLaunchStateVersion !== context.controlledLaunchStateVersion) {
    return { allowed: false, code: "APPROVAL_STATE_VERSION_MISMATCH", reason: "Persisted approval was issued for a different controlled-launch state version." };
  }
  if (approval.revokedAt) {
    return { allowed: false, code: "APPROVAL_REVOKED", reason: "Persisted outbound approval has been revoked." };
  }
  if (approval.consumedAt) {
    return { allowed: false, code: "APPROVAL_CONSUMED", reason: "Persisted outbound approval has already been consumed." };
  }
  if (approval.expiresAt.getTime() <= now.getTime()) {
    return { allowed: false, code: "APPROVAL_EXPIRED", reason: "Persisted outbound approval has expired." };
  }
  return { allowed: true, approvalId: approval.id };
}

type RawLaunchState = {
  workspaceId: string;
  mode: string;
  writePolicy: string;
  externalWritesAllowed: boolean;
  scope: unknown;
  version: number;
};

type RawApproval = ControlledLaunchOutboundApprovalRecord;

function scopeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ControlledLaunchOutboundApprovalError("APPROVAL_GOVERNANCE_INVALID", "Persisted controlled-launch scope is invalid.");
  }
  return value as Record<string, unknown>;
}

function assertLaunchStateAllowsApproval(
  state: RawLaunchState | undefined,
  workspaceId: string,
  connectionId: string,
): asserts state is RawLaunchState {
  if (!state) throw new ControlledLaunchOutboundApprovalError("APPROVAL_GOVERNANCE_MISSING", "Controlled-launch state is missing.");
  const scope = scopeRecord(state.scope);
  const accounts = Array.isArray(scope.connectedAccountIds) ? scope.connectedAccountIds : [];
  const channels = Array.isArray(scope.enabledChannels) ? scope.enabledChannels : [];
  if (
    state.workspaceId !== workspaceId ||
    state.mode !== "APPROVAL_ONLY" ||
    state.writePolicy !== "HUMAN_APPROVAL_REQUIRED" ||
    !state.externalWritesAllowed ||
    scope.workspaceId !== workspaceId ||
    scope.externalWritesRequested !== true ||
    !accounts.includes(connectionId) ||
    !channels.some((value) => typeof value === "string" && value.trim().toUpperCase() === "WHATSAPP")
  ) {
    throw new ControlledLaunchOutboundApprovalError(
      "APPROVAL_GOVERNANCE_DENIED",
      "Current persisted controlled-launch state does not permit a human-approved WhatsApp write for this scope.",
    );
  }
}

function mapApproval(row: RawApproval): ControlledLaunchOutboundApprovalRecord {
  return { ...row };
}

export async function approveControlledLaunchOutbound(input: {
  workspaceId: string;
  connectionId: string;
  messageId: string;
  approvedByUserId: string;
  reason: string;
  ttlMs?: number;
}): Promise<ControlledLaunchOutboundApprovalRecord> {
  const workspaceId = nonEmpty(input.workspaceId, "workspaceId", 200);
  const connectionId = nonEmpty(input.connectionId, "connectionId", 200);
  const messageId = nonEmpty(input.messageId, "messageId", 200);
  const approvedByUserId = nonEmpty(input.approvedByUserId, "approvedByUserId", 200);
  const reason = nonEmpty(input.reason, "Approval reason", 1_000);
  const ttlMs = input.ttlMs ?? 10 * 60 * 1_000;
  if (!Number.isInteger(ttlMs) || ttlMs <= 0 || ttlMs > OUTBOUND_APPROVAL_MAX_TTL_MS) {
    throw new ControlledLaunchOutboundApprovalError("APPROVAL_INVALID_TTL", "Approval TTL must be between 1 ms and 30 minutes.");
  }

  return prisma.$transaction(async (tx) => {
    const [state] = await tx.$queryRaw<RawLaunchState[]>`
      SELECT "workspaceId", "mode", "writePolicy", "externalWritesAllowed", "scope", "version"
      FROM "EngageControlledLaunchState"
      WHERE "workspaceId" = ${workspaceId}
      FOR SHARE
    `;
    assertLaunchStateAllowsApproval(state, workspaceId, connectionId);

    const message = await tx.whatsAppMessage.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        direction: true,
        status: true,
        conversation: { select: { contact: { select: { id: true, waId: true, metadata: true } } } },
      },
    });
    if (!message || message.direction !== MessageDirection.OUTBOUND || message.status !== MessageStatus.QUEUED) {
      throw new ControlledLaunchOutboundApprovalError("APPROVAL_MESSAGE_INVALID", "Approval target must be an existing QUEUED outbound WhatsApp message.");
    }
    const mapping = readLegacyWhatsAppMappingMetadata(message.conversation.contact.metadata);
    if (
      !mapping ||
      mapping.workspaceId !== workspaceId ||
      mapping.connectionId !== connectionId ||
      mapping.legacyContactId !== message.conversation.contact.id ||
      mapping.externalUserId !== message.conversation.contact.waId
    ) {
      throw new ControlledLaunchOutboundApprovalError("APPROVAL_SCOPE_MISMATCH", "Queued message identity mapping does not match the requested approval scope.");
    }

    const contentFingerprint = await currentQueuedMessageFingerprint(tx, messageId);

    const approver = await tx.engageWorkspaceMembership.findFirst({
      where: { workspaceId, userId: approvedByUserId, isActive: true, user: { isActive: true } },
      select: { id: true },
    });
    if (!approver) {
      throw new ControlledLaunchOutboundApprovalError("APPROVAL_ACTOR_FORBIDDEN", "Approver is not an active member of this workspace.");
    }

    await tx.$executeRaw`
      UPDATE "EngageControlledLaunchOutboundApproval"
      SET "revokedAt" = CURRENT_TIMESTAMP
      WHERE "workspaceId" = ${workspaceId}
        AND "connectionId" = ${connectionId}
        AND "messageId" = ${messageId}
        AND "consumedAt" IS NULL
        AND "revokedAt" IS NULL
    `;

    const id = randomUUID();
    const expiresAt = new Date(Date.now() + ttlMs);
    const rows = await tx.$queryRaw<RawApproval[]>`
      INSERT INTO "EngageControlledLaunchOutboundApproval" (
        "id", "workspaceId", "connectionId", "messageId", "contentFingerprint", "controlledLaunchStateVersion",
        "approvedByUserId", "reason", "expiresAt"
      ) VALUES (
        ${id}, ${workspaceId}, ${connectionId}, ${messageId}, ${contentFingerprint}, ${state.version},
        ${approvedByUserId}, ${reason}, ${expiresAt}
      )
      RETURNING "id", "workspaceId", "connectionId", "messageId", "contentFingerprint", "controlledLaunchStateVersion",
                "approvedByUserId", "reason", "approvedAt", "expiresAt", "consumedAt", "revokedAt", "createdAt"
    `;
    const created = rows[0];
    if (!created) throw new ControlledLaunchOutboundApprovalError("APPROVAL_PERSIST_FAILED", "Failed to persist outbound approval.");
    return mapApproval(created);
  });
}

export async function getActiveControlledLaunchOutboundApproval(
  context: OutboundApprovalContext,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<ControlledLaunchOutboundApprovalRecord | null> {
  const rows = await client.$queryRaw<RawApproval[]>`
    SELECT "id", "workspaceId", "connectionId", "messageId", "contentFingerprint", "controlledLaunchStateVersion",
           "approvedByUserId", "reason", "approvedAt", "expiresAt", "consumedAt", "revokedAt", "createdAt"
    FROM "EngageControlledLaunchOutboundApproval"
    WHERE "workspaceId" = ${context.workspaceId}
      AND "connectionId" = ${context.connectionId}
      AND "messageId" = ${context.messageId}
      AND "controlledLaunchStateVersion" = ${context.controlledLaunchStateVersion}
      AND "contentFingerprint" = ${context.contentFingerprint}
      AND "consumedAt" IS NULL
      AND "revokedAt" IS NULL
    ORDER BY "createdAt" DESC
    LIMIT 1
  `;
  return rows[0] ? mapApproval(rows[0]) : null;
}

export async function assertActiveControlledLaunchOutboundApproval(
  context: Omit<OutboundApprovalContext, "contentFingerprint">,
): Promise<ControlledLaunchOutboundApprovalRecord> {
  const contentFingerprint = await currentQueuedMessageFingerprint(prisma, context.messageId);
  const resolvedContext: OutboundApprovalContext = { ...context, contentFingerprint };
  const approval = await getActiveControlledLaunchOutboundApproval(resolvedContext);
  const decision = evaluateOutboundApproval({ context: resolvedContext, approval });
  if (!decision.allowed) {
    throw new ControlledLaunchOutboundApprovalError(decision.code, decision.reason);
  }
  return approval!;
}

export async function consumeControlledLaunchOutboundApproval(
  context: OutboundApprovalContext,
): Promise<ControlledLaunchOutboundApprovalRecord> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<RawApproval[]>`
      UPDATE "EngageControlledLaunchOutboundApproval" AS approval
      SET "consumedAt" = CURRENT_TIMESTAMP
      FROM "EngageControlledLaunchState" AS launch
      WHERE approval."workspaceId" = ${context.workspaceId}
        AND approval."connectionId" = ${context.connectionId}
        AND approval."messageId" = ${context.messageId}
        AND approval."controlledLaunchStateVersion" = ${context.controlledLaunchStateVersion}
        AND approval."contentFingerprint" = ${context.contentFingerprint}
        AND approval."consumedAt" IS NULL
        AND approval."revokedAt" IS NULL
        AND approval."expiresAt" > CURRENT_TIMESTAMP
        AND launch."workspaceId" = approval."workspaceId"
        AND launch."version" = approval."controlledLaunchStateVersion"
        AND launch."mode" = 'APPROVAL_ONLY'
        AND launch."writePolicy" = 'HUMAN_APPROVAL_REQUIRED'
        AND launch."externalWritesAllowed" = true
      RETURNING approval."id", approval."workspaceId", approval."connectionId", approval."messageId", approval."contentFingerprint",
                approval."controlledLaunchStateVersion", approval."approvedByUserId", approval."reason",
                approval."approvedAt", approval."expiresAt", approval."consumedAt", approval."revokedAt", approval."createdAt"
    `;
    const consumed = rows[0];
    if (!consumed) {
      throw new ControlledLaunchOutboundApprovalError(
        "APPROVAL_CONSUME_DENIED",
        "A current, unexpired, unconsumed persisted approval could not be atomically consumed.",
      );
    }
    return mapApproval(consumed);
  });
}

export async function consumeCurrentControlledLaunchOutboundApproval(input: { workspaceId: string; connectionId: string; messageId: string; }): Promise<ControlledLaunchOutboundApprovalRecord> {
  return prisma.$transaction(async (tx) => {
    const contentFingerprint = await currentQueuedMessageFingerprint(tx, input.messageId);
    const rows = await tx.$queryRaw<RawApproval[]>`
      UPDATE "EngageControlledLaunchOutboundApproval" AS approval SET "consumedAt" = CURRENT_TIMESTAMP
      FROM "EngageControlledLaunchState" AS launch
      WHERE approval."workspaceId" = ${input.workspaceId} AND approval."connectionId" = ${input.connectionId} AND approval."messageId" = ${input.messageId}
        AND approval."contentFingerprint" = ${contentFingerprint} AND approval."controlledLaunchStateVersion" = launch."version"
        AND approval."consumedAt" IS NULL AND approval."revokedAt" IS NULL AND approval."expiresAt" > CURRENT_TIMESTAMP
        AND launch."workspaceId" = approval."workspaceId" AND launch."mode" = 'APPROVAL_ONLY' AND launch."writePolicy" = 'HUMAN_APPROVAL_REQUIRED' AND launch."externalWritesAllowed" = true
      RETURNING approval."id", approval."workspaceId", approval."connectionId", approval."messageId", approval."contentFingerprint", approval."controlledLaunchStateVersion", approval."approvedByUserId", approval."reason", approval."approvedAt", approval."expiresAt", approval."consumedAt", approval."revokedAt", approval."createdAt"
    `;
    const consumed = rows[0];
    if (!consumed) throw new ControlledLaunchOutboundApprovalError("APPROVAL_CONSUME_DENIED", "Current persisted approval could not be atomically consumed before the provider write.");
    return mapApproval(consumed);
  });
}
