import {
  MessageActor,
  MessageDirection,
  MessageStatus,
  MessageType,
  Prisma,
} from "@prisma/client";
import { createHash } from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import { getOutboundMode } from "@/lib/meta/outbound-client";
import { readLegacyWhatsAppMappingMetadata } from "@/modules/channels/whatsapp/application/legacy-identity-mapping";
import { prismaControlledLaunchStateRepository } from "@/modules/release/infrastructure/prisma-controlled-launch-state-repository";

const DEFAULT_WORKSPACE_ID = "engagews_default";
const INVENTORY_LIMIT = 100;

type EvidenceMode = "DRY_RUN" | "VERIFY";

type ApprovalRow = {
  workspaceId: string;
  connectionId: string;
  approvedByUserId: string;
  approvedAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

function envText(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

function requiredEnv(name: string): string {
  const value = envText(name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function evidenceMode(): EvidenceMode {
  const value = envText("PHASE17_CANARY_EVIDENCE_MODE", "DRY_RUN").toUpperCase();
  if (value === "DRY_RUN" || value === "VERIFY") return value;
  throw new Error("PHASE17_CANARY_EVIDENCE_MODE must be DRY_RUN or VERIFY.");
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
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

function statusRank(status: MessageStatus): number {
  if (status === MessageStatus.QUEUED) return 0;
  if (status === MessageStatus.SENT) return 1;
  if (status === MessageStatus.DELIVERED) return 2;
  if (status === MessageStatus.READ) return 3;
  if (status === MessageStatus.FAILED) return 99;
  return -1;
}

function assertShadowState(
  state: Awaited<ReturnType<typeof prismaControlledLaunchStateRepository.getState>>,
  workspaceId: string,
  connectionId?: string,
) {
  if (
    !state ||
    state.workspaceId !== workspaceId ||
    state.scope.workspaceId !== workspaceId ||
    state.stage !== "ONE_CONNECTED_ACCOUNT" ||
    state.mode !== "SHADOW" ||
    state.writePolicy !== "NO_EXTERNAL_WRITES" ||
    state.externalWritesAllowed ||
    state.scope.externalWritesRequested
  ) {
    throw new Error("Canary evidence requires ONE_CONNECTED_ACCOUNT SHADOW/no-external-writes.");
  }
  if (
    connectionId &&
    (state.scope.connectedAccountIds.length !== 1 ||
      state.scope.connectedAccountIds[0] !== connectionId)
  ) {
    throw new Error("Controlled-launch scope no longer matches the canary WhatsApp connection.");
  }
  return state;
}

async function inventory(workspaceId: string) {
  const state = assertShadowState(
    await prismaControlledLaunchStateRepository.getState(workspaceId),
    workspaceId,
  );
  if (getOutboundMode() === "live") {
    throw new Error("Read-only canary evidence observer requires the base provider to be non-live.");
  }

  const recent = await prisma.whatsAppMessage.findMany({
    where: { direction: MessageDirection.OUTBOUND },
    orderBy: { createdAt: "desc" },
    take: INVENTORY_LIMIT,
    select: { status: true, rawPayload: true },
  });

  const controlled = recent.filter(
    (message) => controlledCanaryMetadata(message.rawPayload)?.kind === "PHASE17_SINGLE_MESSAGE",
  );
  const statusHistogram = controlled.reduce<Record<string, number>>((acc, message) => {
    acc[message.status] = (acc[message.status] ?? 0) + 1;
    return acc;
  }, {});

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
        inspectedRecentOutbound: recent.length,
        controlledCanaryCount: controlled.length,
        controlledCanaryStatusHistogram: statusHistogram,
        mutationPerformed: false,
        externalWhatsAppWriteSent: false,
      },
      null,
      2,
    ),
  );
}

async function approvalEvidence(messageId: string): Promise<ApprovalRow[]> {
  return prisma.$queryRaw<ApprovalRow[]>`
    SELECT
      "workspaceId",
      "connectionId",
      "approvedByUserId",
      "approvedAt",
      "expiresAt",
      "consumedAt",
      "revokedAt",
      "createdAt"
    FROM "EngageControlledLaunchOutboundApproval"
    WHERE "messageId" = ${messageId}
    ORDER BY "createdAt" DESC
  `;
}

async function duplicateIntentCount(intentHash: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "WhatsAppMessage"
    WHERE "rawPayload" #>> '{outbound,controlledCanary,intentHash}' = ${intentHash}
  `;
  return Number(rows[0]?.count ?? 0n);
}

async function verify(workspaceId: string) {
  const messageId = requiredEnv("PHASE17_CANARY_EVIDENCE_MESSAGE_ID");
  if (getOutboundMode() === "live") {
    throw new Error("Post-canary evidence must run after the base WhatsApp provider returns fail-closed.");
  }

  const message = await prisma.whatsAppMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      direction: true,
      actor: true,
      type: true,
      status: true,
      metaMessageId: true,
      failureCode: true,
      failureReason: true,
      rawPayload: true,
      statusEvents: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { status: true, metaTimestamp: true, createdAt: true },
      },
      conversation: {
        select: {
          contact: { select: { id: true, waId: true, metadata: true } },
        },
      },
    },
  });
  if (!message) throw new Error("Exact canary evidence message does not exist.");
  if (message.direction !== MessageDirection.OUTBOUND) throw new Error("Canary evidence message is not outbound.");
  if (message.actor !== MessageActor.COUNSELOR) throw new Error("Canary evidence message is not counselor-authored.");
  if (message.type !== MessageType.TEXT) throw new Error("Initial Phase17 canary evidence is restricted to TEXT.");

  const marker = controlledCanaryMetadata(message.rawPayload);
  const intentHash = typeof marker?.intentHash === "string" ? marker.intentHash.toLowerCase() : "";
  const operatorRunId = typeof marker?.operatorRunId === "string" ? marker.operatorRunId : "";
  const stagedByUserId = typeof marker?.stagedByUserId === "string" ? marker.stagedByUserId : "";
  if (
    marker?.kind !== "PHASE17_SINGLE_MESSAGE" ||
    !/^[a-f0-9]{64}$/.test(intentHash) ||
    !operatorRunId ||
    !stagedByUserId
  ) {
    throw new Error("Exact message is missing valid controlled-canary provenance.");
  }

  const mapping = readLegacyWhatsAppMappingMetadata(message.conversation.contact.metadata);
  if (
    !mapping ||
    mapping.workspaceId !== workspaceId ||
    mapping.legacyContactId !== message.conversation.contact.id ||
    mapping.externalUserId !== message.conversation.contact.waId ||
    mapping.channel !== "WHATSAPP"
  ) {
    throw new Error("Canary recipient no longer has authoritative WhatsApp identity mapping.");
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
  if (!connection) throw new Error("Canary WhatsApp connection is not active.");

  const state = assertShadowState(
    await prismaControlledLaunchStateRepository.getState(workspaceId),
    workspaceId,
    connection.id,
  );

  const outbound = outboundMetadata(message.rawPayload);
  const attemptCount =
    typeof outbound.attemptCount === "number" && Number.isFinite(outbound.attemptCount)
      ? Math.floor(outbound.attemptCount)
      : -1;
  const metaAcceptedStatus =
    typeof outbound.metaAcceptedStatus === "number" && Number.isFinite(outbound.metaAcceptedStatus)
      ? Math.floor(outbound.metaAcceptedStatus)
      : null;

  const approvals = await approvalEvidence(message.id);
  const openApprovalCount = approvals.filter(
    (approval) => approval.consumedAt === null && approval.revokedAt === null,
  ).length;
  const consumedMatchingApprovalCount = approvals.filter(
    (approval) =>
      approval.workspaceId === workspaceId &&
      approval.connectionId === connection.id &&
      approval.approvedByUserId === stagedByUserId &&
      approval.consumedAt !== null &&
      approval.revokedAt === null,
  ).length;

  const eventStatuses = message.statusEvents.map((event) => event.status);
  let lastRank = 0;
  let statusRegressionDetected = false;
  for (const status of eventStatuses) {
    const rank = statusRank(status);
    if (rank === 99) continue;
    if (rank >= 0 && rank < lastRank) statusRegressionDetected = true;
    if (rank >= 0) lastRank = Math.max(lastRank, rank);
  }

  const sentEventPresent = eventStatuses.includes(MessageStatus.SENT);
  const failureEventCount = eventStatuses.filter((status) => status === MessageStatus.FAILED).length;
  const duplicateCount = await duplicateIntentCount(intentHash);
  const canonicalStatusAccepted = [
    MessageStatus.SENT,
    MessageStatus.DELIVERED,
    MessageStatus.READ,
  ].includes(message.status);
  const providerAccepted =
    metaAcceptedStatus !== null && metaAcceptedStatus >= 200 && metaAcceptedStatus < 300;

  if (!canonicalStatusAccepted) {
    throw new Error(`Canary canonical status is ${message.status}, not SENT/DELIVERED/READ.`);
  }
  if (!message.metaMessageId) throw new Error("Canary has no persisted Meta message ID.");
  if (message.failureCode || message.failureReason) throw new Error("Canary has persisted failure evidence.");
  if (attemptCount !== 1) throw new Error(`Canary attemptCount must be exactly 1; found ${attemptCount}.`);
  if (!providerAccepted) throw new Error("Canary has no successful Meta acceptance status.");
  if (!sentEventPresent) throw new Error("Canary status-event history is missing SENT.");
  if (failureEventCount > 0) throw new Error("Canary status-event history contains FAILED.");
  if (statusRegressionDetected) throw new Error("Canary status-event history regressed.");
  if (duplicateCount !== 1) throw new Error(`Canary intent appears ${duplicateCount} times; expected exactly 1.`);
  if (openApprovalCount !== 0) throw new Error("Canary still has an unconsumed/unrevoked approval.");
  if (consumedMatchingApprovalCount < 1) {
    throw new Error("Canary has no consumed approval matching workspace, connection, and staged operator.");
  }

  console.log(
    JSON.stringify(
      {
        mode: "VERIFY",
        workspaceId,
        messageIdDigest: digest(message.id),
        intentHashDigest: digest(intentHash),
        operatorRunIdDigest: digest(operatorRunId),
        connectionIdDigest: digest(connection.id),
        canonicalStatus: message.status,
        metaMessageIdPresent: true,
        attemptCount,
        providerAccepted,
        statusEventCount: eventStatuses.length,
        statusEvents: eventStatuses,
        sentEventPresent,
        failureEventCount,
        statusRegressionDetected,
        duplicateIntentCount: duplicateCount,
        approvalCount: approvals.length,
        openApprovalCount,
        consumedMatchingApprovalCount,
        controlledLaunch: {
          stage: state.stage,
          mode: state.mode,
          writePolicy: state.writePolicy,
          externalWritesAllowed: state.externalWritesAllowed,
          version: state.version,
        },
        outboundMode: getOutboundMode(),
        verificationPassed: true,
        mutationPerformed: false,
        externalWhatsAppWriteSent: false,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const workspaceId = envText("PHASE17_CANARY_WORKSPACE_ID", DEFAULT_WORKSPACE_ID);
  const mode = evidenceMode();
  if (mode === "DRY_RUN") return inventory(workspaceId);
  return verify(workspaceId);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
