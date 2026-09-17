import { randomUUID } from "node:crypto";
import { MessageDirection, MessageStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { readLegacyWhatsAppMappingMetadata } from "@/modules/channels/whatsapp/application/legacy-identity-mapping";

export type BoundedAutopilotCapacityDecision =
  | { allowed: true; alreadyReserved: boolean }
  | { allowed: false; code: "BOUNDED_AUTOPILOT_CAP_INVALID" | "BOUNDED_AUTOPILOT_CAP_EXHAUSTED"; reason: string };

export class ControlledLaunchBoundedAutopilotError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ControlledLaunchBoundedAutopilotError";
    this.code = code;
  }
}

export function normalizeBoundedAutopilotRecipientKey(value: string): string {
  const normalized = value.replace(/^\+/, "").replace(/\D/g, "");
  if (!normalized) throw new ControlledLaunchBoundedAutopilotError("BOUNDED_AUTOPILOT_RECIPIENT_INVALID", "WhatsApp recipient identity is invalid.");
  return normalized;
}

export function isBoundedAutopilotReservationConnectionMatch(existingConnectionId: string, requestedConnectionId: string): boolean {
  return existingConnectionId.trim() === requestedConnectionId.trim();
}

export function evaluateBoundedAutopilotCapacity(input: {
  maxRealLeads: number;
  reservedRecipients: number;
  alreadyReserved: boolean;
}): BoundedAutopilotCapacityDecision {
  if (!Number.isInteger(input.maxRealLeads) || input.maxRealLeads <= 0) {
    return { allowed: false, code: "BOUNDED_AUTOPILOT_CAP_INVALID", reason: "Bounded autopilot requires a positive persisted real-lead cap." };
  }
  if (!Number.isInteger(input.reservedRecipients) || input.reservedRecipients < 0) {
    return { allowed: false, code: "BOUNDED_AUTOPILOT_CAP_INVALID", reason: "Persisted bounded-autopilot recipient usage is invalid." };
  }
  if (input.alreadyReserved) return { allowed: true, alreadyReserved: true };
  if (input.reservedRecipients >= input.maxRealLeads) {
    return { allowed: false, code: "BOUNDED_AUTOPILOT_CAP_EXHAUSTED", reason: `Bounded autopilot distinct-recipient cap (${input.maxRealLeads}) is exhausted.` };
  }
  return { allowed: true, alreadyReserved: false };
}

type RawState = {
  workspaceId: string;
  mode: string;
  writePolicy: string;
  externalWritesAllowed: boolean;
  scope: unknown;
  version: number;
};

type RawReservation = {
  id: string;
  workspaceId: string;
  connectionId: string;
  controlledLaunchStateVersion: number;
  recipientKey: string;
  firstMessageId: string;
  createdAt: Date;
};

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new ControlledLaunchBoundedAutopilotError("BOUNDED_AUTOPILOT_CONTEXT_INVALID", `${field} is required.`);
  return normalized;
}

function parseScope(value: unknown): {
  workspaceId: string;
  connectedAccountIds: string[];
  enabledChannels: string[];
  maxRealLeads: number;
  externalWritesRequested: boolean;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ControlledLaunchBoundedAutopilotError("BOUNDED_AUTOPILOT_SCOPE_INVALID", "Persisted controlled-launch scope is invalid.");
  }
  const scope = value as Record<string, unknown>;
  if (
    typeof scope.workspaceId !== "string" ||
    !Array.isArray(scope.connectedAccountIds) || scope.connectedAccountIds.some((item) => typeof item !== "string") ||
    !Array.isArray(scope.enabledChannels) || scope.enabledChannels.some((item) => typeof item !== "string") ||
    typeof scope.maxRealLeads !== "number" || !Number.isInteger(scope.maxRealLeads) ||
    typeof scope.externalWritesRequested !== "boolean"
  ) {
    throw new ControlledLaunchBoundedAutopilotError("BOUNDED_AUTOPILOT_SCOPE_INVALID", "Persisted bounded-autopilot scope fields are invalid.");
  }
  return {
    workspaceId: scope.workspaceId,
    connectedAccountIds: scope.connectedAccountIds as string[],
    enabledChannels: scope.enabledChannels as string[],
    maxRealLeads: scope.maxRealLeads,
    externalWritesRequested: scope.externalWritesRequested,
  };
}

export async function reserveBoundedAutopilotRecipient(input: {
  workspaceId: string;
  connectionId: string;
  messageId: string;
  recipientKey: string;
}): Promise<{ reservation: RawReservation; alreadyReserved: boolean; reservedRecipients: number; maxRealLeads: number }> {
  const workspaceId = requireText(input.workspaceId, "workspaceId");
  const connectionId = requireText(input.connectionId, "connectionId");
  const messageId = requireText(input.messageId, "messageId");
  const recipientKey = normalizeBoundedAutopilotRecipientKey(input.recipientKey);

  return prisma.$transaction(async (tx) => {
    const states = await tx.$queryRaw<RawState[]>`
      SELECT "workspaceId", "mode", "writePolicy", "externalWritesAllowed", "scope", "version"
      FROM "EngageControlledLaunchState"
      WHERE "workspaceId" = ${workspaceId}
      FOR UPDATE
    `;
    const state = states[0];
    if (!state) throw new ControlledLaunchBoundedAutopilotError("BOUNDED_AUTOPILOT_STATE_MISSING", "Controlled-launch state is missing.");
    const scope = parseScope(state.scope);
    const channels = scope.enabledChannels.map((value) => value.trim().toUpperCase());
    if (
      state.workspaceId !== workspaceId || state.mode !== "LIMITED_AUTOPILOT" || state.writePolicy !== "BOUNDED_AUTOPILOT" ||
      !state.externalWritesAllowed || scope.workspaceId !== workspaceId || scope.externalWritesRequested !== true ||
      !scope.connectedAccountIds.includes(connectionId) || !channels.includes("WHATSAPP")
    ) {
      throw new ControlledLaunchBoundedAutopilotError("BOUNDED_AUTOPILOT_GOVERNANCE_DENIED", "Current persisted controlled-launch state does not permit bounded WhatsApp autopilot for this scope.");
    }

    const message = await tx.whatsAppMessage.findUnique({
      where: { id: messageId },
      select: { id: true, direction: true, status: true, conversation: { select: { contact: { select: { id: true, waId: true, metadata: true } } } } },
    });
    if (!message || message.direction !== MessageDirection.OUTBOUND || message.status !== MessageStatus.QUEUED) {
      throw new ControlledLaunchBoundedAutopilotError("BOUNDED_AUTOPILOT_MESSAGE_INVALID", "Bounded-autopilot reservation requires an existing QUEUED outbound message.");
    }
    const mapping = readLegacyWhatsAppMappingMetadata(message.conversation.contact.metadata);
    if (
      !mapping || mapping.workspaceId !== workspaceId || mapping.connectionId !== connectionId ||
      mapping.legacyContactId !== message.conversation.contact.id || mapping.externalUserId !== message.conversation.contact.waId ||
      normalizeBoundedAutopilotRecipientKey(message.conversation.contact.waId) !== recipientKey
    ) {
      throw new ControlledLaunchBoundedAutopilotError("BOUNDED_AUTOPILOT_RECIPIENT_MISMATCH", "Queued message recipient identity does not match the bounded-autopilot governance context.");
    }

    const existing = await tx.$queryRaw<RawReservation[]>`
      SELECT "id", "workspaceId", "connectionId", "controlledLaunchStateVersion", "recipientKey", "firstMessageId", "createdAt"
      FROM "EngageControlledLaunchAutopilotRecipient"
      WHERE "workspaceId" = ${workspaceId} AND "controlledLaunchStateVersion" = ${state.version} AND "recipientKey" = ${recipientKey}
      LIMIT 1
    `;
    const counts = await tx.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS "count"
      FROM "EngageControlledLaunchAutopilotRecipient"
      WHERE "workspaceId" = ${workspaceId} AND "controlledLaunchStateVersion" = ${state.version}
    `;
    const reservedRecipients = counts[0] ? Number(counts[0].count) : 0;
    if (existing[0] && !isBoundedAutopilotReservationConnectionMatch(existing[0].connectionId, connectionId)) {
      throw new ControlledLaunchBoundedAutopilotError(
        "BOUNDED_AUTOPILOT_RESERVATION_SCOPE_MISMATCH",
        "Recipient is already reserved under a different WhatsApp connection for this controlled-launch state version.",
      );
    }
    const decision = evaluateBoundedAutopilotCapacity({ maxRealLeads: scope.maxRealLeads, reservedRecipients, alreadyReserved: Boolean(existing[0]) });
    if (!decision.allowed) throw new ControlledLaunchBoundedAutopilotError(decision.code, decision.reason);
    if (existing[0]) return { reservation: existing[0], alreadyReserved: true, reservedRecipients, maxRealLeads: scope.maxRealLeads };

    const id = randomUUID();
    const rows = await tx.$queryRaw<RawReservation[]>`
      INSERT INTO "EngageControlledLaunchAutopilotRecipient" (
        "id", "workspaceId", "connectionId", "controlledLaunchStateVersion", "recipientKey", "firstMessageId"
      ) VALUES (${id}, ${workspaceId}, ${connectionId}, ${state.version}, ${recipientKey}, ${messageId})
      RETURNING "id", "workspaceId", "connectionId", "controlledLaunchStateVersion", "recipientKey", "firstMessageId", "createdAt"
    `;
    const reservation = rows[0];
    if (!reservation) throw new ControlledLaunchBoundedAutopilotError("BOUNDED_AUTOPILOT_RESERVATION_FAILED", "Failed to persist bounded-autopilot recipient reservation.");
    return { reservation, alreadyReserved: false, reservedRecipients: reservedRecipients + 1, maxRealLeads: scope.maxRealLeads };
  });
}
