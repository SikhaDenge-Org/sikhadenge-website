import {
  DashboardRole,
  MessageActor,
  MessageDirection,
  MessageStatus,
  MessageType,
  Prisma,
} from "@prisma/client";
import { createHash } from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import { getOutboundMode } from "@/lib/meta/outbound-client";
import { queueOutboundMessage } from "@/lib/outbound/outbound-service";
import { readLegacyWhatsAppMappingMetadata } from "@/modules/channels/whatsapp/application/legacy-identity-mapping";
import { prismaControlledLaunchStateRepository } from "@/modules/release/infrastructure/prisma-controlled-launch-state-repository";

const DEFAULT_WORKSPACE_ID = "engagews_default";
const MAX_TEXT_LENGTH = 4_096;
const ALLOWED_APPROVER_ROLES = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
  DashboardRole.COUNSELOR,
]);

type StageMode = "DRY_RUN" | "STAGE" | "CANCEL";

type CandidateConversation = {
  id: string;
  status: string;
  agentMode: string;
  source: string;
  serviceWindowOpen: boolean;
  serviceWindowExpiresAt: string | null;
  assigned: boolean;
  lastMessageAt: string | null;
};

function envText(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

function requiredEnv(name: string): string {
  const value = envText(name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function mode(): StageMode {
  const value = envText("PHASE17_CANARY_STAGE_MODE", "DRY_RUN").toUpperCase();
  if (value === "DRY_RUN" || value === "STAGE" || value === "CANCEL") return value;
  throw new Error("PHASE17_CANARY_STAGE_MODE must be DRY_RUN, STAGE, or CANCEL.");
}

function normalizeWaId(value: string): string {
  return value.replace(/^\+/, "").replace(/\D/g, "");
}

function maskRecipient(value: string): string {
  const digits = normalizeWaId(value);
  if (!digits) return "masked";
  const suffix = digits.slice(-4);
  return `${"*".repeat(Math.max(0, Math.min(8, digits.length - suffix.length)))}${suffix}`;
}

function compactText(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function intentHash(input: {
  workspaceId: string;
  waId: string;
  conversationId: string;
  text: string;
}): string {
  return createHash("sha256")
    .update(
      [
        "phase17-single-message-canary-v1",
        input.workspaceId,
        normalizeWaId(input.waId),
        input.conversationId,
        compactText(input.text),
      ].join("\n"),
      "utf8",
    )
    .digest("hex");
}

function asRecord(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function outboundMetadata(value: Prisma.JsonValue | null): Record<string, unknown> {
  const root = asRecord(value);
  return root.outbound && typeof root.outbound === "object" && !Array.isArray(root.outbound)
    ? (root.outbound as Record<string, unknown>)
    : {};
}

function controlledCanaryMetadata(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  const marker = outboundMetadata(value).controlledCanary;
  return marker && typeof marker === "object" && !Array.isArray(marker)
    ? (marker as Record<string, unknown>)
    : null;
}

async function assertFailClosedBaseline(workspaceId: string, connectionId?: string) {
  if (getOutboundMode() === "live") {
    throw new Error("Canary target staging requires the base WhatsApp provider to remain non-live.");
  }

  const state = await prismaControlledLaunchStateRepository.getState(workspaceId);
  if (
    !state ||
    state.workspaceId !== workspaceId ||
    state.stage !== "ONE_CONNECTED_ACCOUNT" ||
    state.mode !== "SHADOW" ||
    state.writePolicy !== "NO_EXTERNAL_WRITES" ||
    state.externalWritesAllowed ||
    state.scope.externalWritesRequested
  ) {
    throw new Error("Canary target staging requires ONE_CONNECTED_ACCOUNT SHADOW/no-external-writes.");
  }

  if (
    connectionId &&
    (state.scope.connectedAccountIds.length !== 1 ||
      state.scope.connectedAccountIds[0] !== connectionId)
  ) {
    throw new Error("Controlled-launch connected account does not match the target recipient mapping.");
  }

  return state;
}

async function resolveApprover(workspaceId: string, userId: string) {
  const user = await prisma.dashboardUser.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isActive: true },
  });
  if (!user || !user.isActive || !ALLOWED_APPROVER_ROLES.has(user.role)) {
    throw new Error("Canary staging approver must be an active ADMIN, MANAGER, or COUNSELOR.");
  }

  const membership = await prisma.engageWorkspaceMembership.findFirst({
    where: {
      workspaceId,
      userId,
      isActive: true,
      workspace: { isActive: true },
    },
    select: { id: true },
  });
  if (!membership) throw new Error("Canary staging approver is not an active workspace member.");
  return user;
}

async function resolveRecipient(workspaceId: string, rawWaId: string) {
  const waId = normalizeWaId(rawWaId);
  if (!/^\d{8,20}$/.test(waId)) {
    throw new Error("PHASE17_CANARY_TARGET_WA_ID must normalize to 8-20 digits.");
  }

  const contact = await prisma.whatsAppContact.findUnique({
    where: { waId },
    select: {
      id: true,
      waId: true,
      metadata: true,
      consentStatus: true,
      conversations: {
        orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
        take: 10,
        select: {
          id: true,
          status: true,
          agentMode: true,
          source: true,
          serviceWindowExpiresAt: true,
          assignedToId: true,
          lastMessageAt: true,
        },
      },
    },
  });
  if (!contact) throw new Error("No existing WhatsApp contact matches the exact target waId.");

  const mapping = readLegacyWhatsAppMappingMetadata(contact.metadata);
  if (
    !mapping ||
    mapping.workspaceId !== workspaceId ||
    mapping.legacyContactId !== contact.id ||
    mapping.externalUserId !== contact.waId ||
    mapping.channel !== "WHATSAPP"
  ) {
    throw new Error("Target contact does not have an authoritative WhatsApp identity mapping.");
  }

  const connection = await prisma.engageChannelConnection.findFirst({
    where: {
      id: mapping.connectionId,
      workspaceId,
      channel: "WHATSAPP",
      status: { in: ["CONNECTED", "DEGRADED"] },
    },
    select: { id: true, status: true },
  });
  if (!connection) throw new Error("Target recipient mapping does not resolve to an active WhatsApp connection.");

  const now = Date.now();
  const conversations: CandidateConversation[] = contact.conversations
    .filter((conversation) => {
      const source = conversation.source?.trim().toLowerCase() || "whatsapp";
      return source === "whatsapp";
    })
    .map((conversation) => ({
      id: conversation.id,
      status: conversation.status,
      agentMode: conversation.agentMode,
      source: conversation.source?.trim().toLowerCase() || "whatsapp",
      serviceWindowOpen: Boolean(
        conversation.serviceWindowExpiresAt && conversation.serviceWindowExpiresAt.getTime() > now,
      ),
      serviceWindowExpiresAt: conversation.serviceWindowExpiresAt?.toISOString() ?? null,
      assigned: Boolean(conversation.assignedToId),
      lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
    }));

  return { contact, connection, conversations };
}

async function queuedCanaryInventory(workspaceId: string) {
  const queued = await prisma.whatsAppMessage.findMany({
    where: {
      direction: MessageDirection.OUTBOUND,
      status: MessageStatus.QUEUED,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      text: true,
      type: true,
      actor: true,
      createdAt: true,
      rawPayload: true,
      conversation: {
        select: { contact: { select: { waId: true, metadata: true } } },
      },
    },
  });

  return queued.flatMap((message) => {
    const marker = controlledCanaryMetadata(message.rawPayload);
    const mapping = readLegacyWhatsAppMappingMetadata(message.conversation.contact.metadata);
    if (
      marker?.kind !== "PHASE17_SINGLE_MESSAGE" ||
      !mapping ||
      mapping.workspaceId !== workspaceId
    ) {
      return [];
    }
    return [
      {
        messageId: message.id,
        type: message.type,
        actor: message.actor,
        createdAt: message.createdAt.toISOString(),
        recipientMasked: maskRecipient(message.conversation.contact.waId),
        preview: (message.text ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
        intentHash: typeof marker.intentHash === "string" ? marker.intentHash : null,
        operatorRunId: typeof marker.operatorRunId === "string" ? marker.operatorRunId : null,
      },
    ];
  });
}

async function runDryRun(workspaceId: string) {
  const state = await assertFailClosedBaseline(workspaceId);
  const rawWaId = envText("PHASE17_CANARY_TARGET_WA_ID");
  const conversationId = envText("PHASE17_CANARY_CONVERSATION_ID");
  const text = compactText(envText("PHASE17_CANARY_TEXT"));
  const inventory = await queuedCanaryInventory(workspaceId);

  let recipient: Awaited<ReturnType<typeof resolveRecipient>> | null = null;
  if (rawWaId) recipient = await resolveRecipient(workspaceId, rawWaId);

  let computedIntentHash: string | null = null;
  if (recipient && conversationId && text) {
    if (text.length > MAX_TEXT_LENGTH) throw new Error("Canary text exceeds 4,096 characters.");
    const conversation = recipient.conversations.find((candidate) => candidate.id === conversationId);
    if (!conversation) throw new Error("Exact conversation ID does not belong to the target WhatsApp contact.");
    if (!conversation.serviceWindowOpen) {
      throw new Error("Initial Phase17 TEXT canary requires an open WhatsApp service window.");
    }
    await assertFailClosedBaseline(workspaceId, recipient.connection.id);
    computedIntentHash = intentHash({
      workspaceId,
      waId: recipient.contact.waId,
      conversationId,
      text,
    });
  }

  console.log(
    JSON.stringify(
      {
        mode: "DRY_RUN",
        workspaceId,
        controlledLaunch: {
          stage: state.stage,
          mode: state.mode,
          writePolicy: state.writePolicy,
          externalWritesAllowed: state.externalWritesAllowed,
          version: state.version,
        },
        outboundMode: getOutboundMode(),
        queuedControlledCanaryCount: inventory.length,
        queuedControlledCanaries: inventory,
        recipient: recipient
          ? {
              recipientMasked: maskRecipient(recipient.contact.waId),
              consentStatus: recipient.contact.consentStatus,
              connectionId: recipient.connection.id,
              connectionStatus: recipient.connection.status,
              conversations: recipient.conversations,
            }
          : null,
        computedIntentHash,
        externalWhatsAppWriteSent: false,
        mutationPerformed: false,
      },
      null,
      2,
    ),
  );
}

async function runStage(workspaceId: string) {
  const rawWaId = requiredEnv("PHASE17_CANARY_TARGET_WA_ID");
  const conversationId = requiredEnv("PHASE17_CANARY_CONVERSATION_ID");
  const text = compactText(requiredEnv("PHASE17_CANARY_TEXT"));
  const approvedByUserId = requiredEnv("PHASE17_CANARY_APPROVER_USER_ID");
  const operatorRunId = requiredEnv("PHASE17_CANARY_OPERATOR_RUN_ID");
  const confirmedIntentHash = requiredEnv("PHASE17_CANARY_CONFIRMED_INTENT_HASH").toLowerCase();

  if (!/^[a-f0-9]{64}$/.test(confirmedIntentHash)) {
    throw new Error("PHASE17_CANARY_CONFIRMED_INTENT_HASH must be a 64-character SHA-256 hex digest.");
  }
  if (!text || text.length > MAX_TEXT_LENGTH) {
    throw new Error("Canary text must contain 1-4,096 characters.");
  }
  if (!/^[A-Za-z0-9_.:-]{1,200}$/.test(operatorRunId)) {
    throw new Error("PHASE17_CANARY_OPERATOR_RUN_ID is invalid.");
  }

  const recipient = await resolveRecipient(workspaceId, rawWaId);
  await assertFailClosedBaseline(workspaceId, recipient.connection.id);
  await resolveApprover(workspaceId, approvedByUserId);

  const conversation = recipient.conversations.find((candidate) => candidate.id === conversationId);
  if (!conversation) throw new Error("Exact conversation ID does not belong to the exact target waId.");
  if (!conversation.serviceWindowOpen) {
    throw new Error("Initial Phase17 TEXT canary requires an open WhatsApp service window.");
  }

  const expectedIntentHash = intentHash({
    workspaceId,
    waId: recipient.contact.waId,
    conversationId,
    text,
  });
  if (expectedIntentHash !== confirmedIntentHash) {
    throw new Error("Confirmed canary intent hash does not match the exact recipient/conversation/text payload.");
  }

  const idempotencyKey = `phase17-canary-stage:${operatorRunId}:${expectedIntentHash}`.slice(0, 200);
  const result = await queueOutboundMessage({
    conversationId,
    actor: MessageActor.COUNSELOR,
    sentById: approvedByUserId,
    content: { kind: "text", text, replyToMetaMessageId: null },
    idempotencyKey,
  });

  if (result.duplicate || !result.message?.id) {
    throw new Error("Canary staging idempotency key already exists; use a fresh operator run attempt.");
  }
  const messageId = result.message.id;

  const queued = await prisma.whatsAppMessage.findUnique({
    where: { id: messageId },
    select: { rawPayload: true },
  });
  if (!queued) throw new Error("Newly staged canary message disappeared before provenance binding.");
  const root = asRecord(queued.rawPayload);
  const outbound = outboundMetadata(queued.rawPayload);
  await prisma.whatsAppMessage.update({
    where: { id: messageId },
    data: {
      rawPayload: toJson({
        ...root,
        outbound: {
          ...outbound,
          controlledCanary: {
            kind: "PHASE17_SINGLE_MESSAGE",
            intentHash: expectedIntentHash,
            operatorRunId,
            stagedByUserId: approvedByUserId,
            stagedAt: new Date().toISOString(),
          },
        },
      }),
    },
  });

  const staged = await prisma.whatsAppMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      direction: true,
      actor: true,
      type: true,
      status: true,
      metaMessageId: true,
      text: true,
      rawPayload: true,
      createdAt: true,
      conversation: { select: { contact: { select: { waId: true } } } },
    },
  });
  const marker = staged ? controlledCanaryMetadata(staged.rawPayload) : null;
  if (
    !staged ||
    staged.direction !== MessageDirection.OUTBOUND ||
    staged.actor !== MessageActor.COUNSELOR ||
    staged.type !== MessageType.TEXT ||
    staged.status !== MessageStatus.QUEUED ||
    staged.metaMessageId ||
    compactText(staged.text ?? "") !== text ||
    normalizeWaId(staged.conversation.contact.waId) !== normalizeWaId(recipient.contact.waId) ||
    marker?.kind !== "PHASE17_SINGLE_MESSAGE" ||
    marker.intentHash !== expectedIntentHash ||
    marker.operatorRunId !== operatorRunId
  ) {
    throw new Error("Persisted canary staging record failed exact-message verification.");
  }

  console.log(
    JSON.stringify(
      {
        mode: "STAGE",
        workspaceId,
        messageId: staged.id,
        status: staged.status,
        type: staged.type,
        actor: staged.actor,
        recipientMasked: maskRecipient(staged.conversation.contact.waId),
        preview: compactText(staged.text ?? "").replace(/\s+/g, " ").slice(0, 120),
        intentHash: expectedIntentHash,
        operatorRunId,
        createdAt: staged.createdAt.toISOString(),
        externalWhatsAppWriteSent: false,
        mutationPerformed: true,
      },
      null,
      2,
    ),
  );
}

async function runCancel(workspaceId: string) {
  const messageId = requiredEnv("PHASE17_CANARY_MESSAGE_ID");
  const approvedByUserId = requiredEnv("PHASE17_CANARY_APPROVER_USER_ID");
  await assertFailClosedBaseline(workspaceId);
  await resolveApprover(workspaceId, approvedByUserId);

  const message = await prisma.whatsAppMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      direction: true,
      status: true,
      metaMessageId: true,
      rawPayload: true,
      conversation: {
        select: {
          contact: { select: { waId: true, metadata: true } },
        },
      },
    },
  });
  if (!message || message.direction !== MessageDirection.OUTBOUND) {
    throw new Error("Canary cancellation target does not exist as an outbound message.");
  }
  const marker = controlledCanaryMetadata(message.rawPayload);
  if (marker?.kind !== "PHASE17_SINGLE_MESSAGE") {
    throw new Error("Refusing to cancel a message that was not staged by the controlled canary stager.");
  }
  if (message.metaMessageId) {
    throw new Error("Refusing to cancel a canary message that already has a Meta message ID.");
  }
  if (message.status !== MessageStatus.QUEUED) {
    throw new Error(`Canary cancellation target is ${message.status}, not QUEUED.`);
  }

  const mapping = readLegacyWhatsAppMappingMetadata(message.conversation.contact.metadata);
  if (!mapping || mapping.workspaceId !== workspaceId) {
    throw new Error("Canary cancellation target no longer has authoritative workspace mapping.");
  }
  await assertFailClosedBaseline(workspaceId, mapping.connectionId);

  const now = new Date();
  await prisma.$transaction([
    prisma.whatsAppMessage.update({
      where: { id: message.id },
      data: {
        status: MessageStatus.FAILED,
        failureCode: "PHASE17_CANARY_STAGE_CANCELLED",
        failureReason: "Controlled canary staged message cancelled before provider dispatch.",
      },
    }),
    prisma.whatsAppMessageStatusEvent.create({
      data: {
        messageId: message.id,
        status: MessageStatus.FAILED,
        metaTimestamp: now,
        rawPayload: toJson({
          source: "phase17_canary_stage_cancel",
          approvedByUserId,
        }),
      },
    }),
  ]);

  console.log(
    JSON.stringify({
      mode: "CANCEL",
      workspaceId,
      messageId: message.id,
      finalStatus: "FAILED",
      recipientMasked: maskRecipient(message.conversation.contact.waId),
      externalWhatsAppWriteSent: false,
      mutationPerformed: true,
    }),
  );
}

async function main() {
  const workspaceId = envText("PHASE17_CANARY_WORKSPACE_ID", DEFAULT_WORKSPACE_ID);
  const selectedMode = mode();
  if (selectedMode === "DRY_RUN") await runDryRun(workspaceId);
  else if (selectedMode === "STAGE") await runStage(workspaceId);
  else await runCancel(workspaceId);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
