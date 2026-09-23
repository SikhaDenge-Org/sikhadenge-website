import {
  MessageActor,
  MessageDirection,
  MessageStatus,
  MessageType,
  TemplateStatus,
} from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { dispatchOutboundMessage } from "@/lib/outbound/outbound-service";
import { getOutboundMode } from "@/lib/meta/outbound-client";
import { readLegacyWhatsAppMappingMetadata } from "@/modules/channels/whatsapp/application/legacy-identity-mapping";
import {
  approveControlledLaunchOutbound,
  ControlledLaunchOutboundApprovalError,
  revokeControlledLaunchOutboundApproval,
} from "@/modules/release/application/controlled-launch-outbound-approval";
import type {
  ControlledLaunchEvidence,
  ControlledLaunchScope,
} from "@/modules/release/application/controlled-launch";
import {
  transitionControlledLaunchState,
  type ControlledLaunchStateRecord,
} from "@/modules/release/application/controlled-launch-state";
import { prismaControlledLaunchStateRepository } from "@/modules/release/infrastructure/prisma-controlled-launch-state-repository";

const DEFAULT_WORKSPACE_ID = "engagews_default";
const MAX_CANARY_MESSAGE_AGE_MS = 30 * 60 * 1_000;

type CanaryMode = "DRY_RUN" | "EXECUTE" | "RESTORE";

type CanaryTarget = {
  messageId: string;
  type: MessageType;
  actor: MessageActor;
  status: MessageStatus;
  createdAt: Date;
  messageTimestamp: Date;
  preview: string;
  recipientMasked: string;
  workspaceId: string;
  connectionId: string;
};

function envText(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

function requiredEnv(name: string): string {
  const value = envText(name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function canaryMode(): CanaryMode {
  const value = envText("PHASE17_CANARY_MODE", "DRY_RUN").toUpperCase();
  if (value === "DRY_RUN" || value === "EXECUTE" || value === "RESTORE") {
    return value;
  }
  throw new Error("PHASE17_CANARY_MODE must be DRY_RUN, EXECUTE, or RESTORE.");
}

function expectedStateVersion(required: boolean): number | null {
  const raw = envText("PHASE17_CANARY_EXPECTED_STATE_VERSION");
  if (!raw && !required) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("PHASE17_CANARY_EXPECTED_STATE_VERSION must be a positive integer.");
  }
  return parsed;
}

function maskRecipient(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "masked";
  const suffix = digits.slice(-4);
  return `${"*".repeat(Math.max(0, Math.min(8, digits.length - suffix.length)))}${suffix}`;
}

function compactPreview(value: string | null): string {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function hasTemplateVariables(value: unknown): boolean {
  if (typeof value === "string") return /{{\s*\d+\s*}}/.test(value);
  if (Array.isArray(value)) return value.some(hasTemplateVariables);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasTemplateVariables);
  }
  return false;
}

function assertShadowBaseline(
  state: ControlledLaunchStateRecord | null,
  workspaceId: string,
  connectionId?: string,
): asserts state is ControlledLaunchStateRecord {
  if (!state) throw new Error("Controlled-launch state is missing.");
  if (
    state.workspaceId !== workspaceId ||
    state.scope.workspaceId !== workspaceId ||
    state.stage !== "ONE_CONNECTED_ACCOUNT" ||
    state.mode !== "SHADOW" ||
    state.writePolicy !== "NO_EXTERNAL_WRITES" ||
    state.externalWritesAllowed ||
    state.scope.externalWritesRequested
  ) {
    throw new Error(
      "Single-message canary requires ONE_CONNECTED_ACCOUNT SHADOW with no external writes.",
    );
  }
  if (
    connectionId &&
    (state.scope.connectedAccountIds.length !== 1 ||
      state.scope.connectedAccountIds[0] !== connectionId)
  ) {
    throw new Error("Controlled-launch scope does not match the canary WhatsApp connection.");
  }
}

function buildApprovalScope(
  state: ControlledLaunchStateRecord,
  connectionId: string,
): ControlledLaunchScope {
  const channels = new Set(
    state.scope.enabledChannels.map((value) => value.trim().toLowerCase()).filter(Boolean),
  );
  channels.add("whatsapp");
  return {
    ...state.scope,
    workspaceId: state.workspaceId,
    connectedAccountIds: [connectionId],
    enabledChannels: [...channels],
    maxRealLeads: 0,
    externalWritesRequested: true,
  };
}

function buildShadowScope(scope: ControlledLaunchScope): ControlledLaunchScope {
  return {
    ...scope,
    maxRealLeads: 0,
    externalWritesRequested: false,
  };
}

function machineEvidence(): ControlledLaunchEvidence {
  if (envText("PHASE17_CANARY_MACHINE_EVIDENCE_VERIFIED") !== "true") {
    throw new Error("Machine evidence must be verified by the guarded operator workflow.");
  }
  return {
    exactShaVerified: true,
    buildVerified: true,
    rollbackTested: true,
    monitoringActive: true,
    permissionsVerified: true,
    policyVerified: true,
    unresolvedCriticalIncidents: 0,
    unexplainedDuplicateSends: 0,
    emergencyStopActive: false,
    scopeApproved: true,
    smokeTestVerified: true,
    supportRunbookActive: true,
    observationWindowComplete: true,
    humanApprovalEnforced: true,
    boundedAutopilotApproved: false,
    approvedFlowsOnlyEnforced: false,
    productionEvidenceRecorded: true,
  };
}

async function resolveTarget(
  workspaceId: string,
  messageId: string,
): Promise<CanaryTarget> {
  const message = await prisma.whatsAppMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      direction: true,
      actor: true,
      type: true,
      status: true,
      text: true,
      createdAt: true,
      messageTimestamp: true,
      rawPayload: true,
      conversation: {
        select: {
          source: true,
          tags: { select: { tag: { select: { name: true } } } },
          contact: {
            select: {
              id: true,
              waId: true,
              metadata: true,
            },
          },
        },
      },
    },
  });
  if (!message || message.direction !== MessageDirection.OUTBOUND) {
    throw new Error("Canary target must be an existing outbound WhatsApp message.");
  }
  if (message.status !== MessageStatus.QUEUED) {
    throw new Error(`Canary target is ${message.status}, not QUEUED.`);
  }
  const contactMetadata =
    message.conversation.contact.metadata &&
    typeof message.conversation.contact.metadata === "object" &&
    !Array.isArray(message.conversation.contact.metadata)
      ? (message.conversation.contact.metadata as Record<string, unknown>)
      : {};
  const engageos =
    contactMetadata.engageos &&
    typeof contactMetadata.engageos === "object" &&
    !Array.isArray(contactMetadata.engageos)
      ? (contactMetadata.engageos as Record<string, unknown>)
      : {};
  const canary =
    engageos.canary && typeof engageos.canary === "object" && !Array.isArray(engageos.canary)
      ? (engageos.canary as Record<string, unknown>)
      : {};
  const rawPayload =
    message.rawPayload && typeof message.rawPayload === "object" && !Array.isArray(message.rawPayload)
      ? (message.rawPayload as Record<string, unknown>)
      : {};
  const outbound =
    rawPayload.outbound && typeof rawPayload.outbound === "object" && !Array.isArray(rawPayload.outbound)
      ? (rawPayload.outbound as Record<string, unknown>)
      : {};
  const source = message.conversation.source?.trim().toLowerCase() || "whatsapp";
  const hasCanaryTag = message.conversation.tags.some((link) => link.tag.name === "CANARY_INTERNAL_TEST");
  const templateId = typeof outbound.templateId === "string" ? outbound.templateId : "";
  const template =
    message.type === MessageType.TEMPLATE && templateId
      ? await prisma.whatsAppTemplate.findUnique({
          where: { id: templateId },
          select: {
            id: true,
            name: true,
            language: true,
            status: true,
            components: true,
          },
        })
      : null;
  const currentTemplateApproved =
    template?.id === templateId &&
    template.name === "hello_world" &&
    template.language === "en_US" &&
    template.status === TemplateStatus.APPROVED &&
    !hasTemplateVariables(template.components);
  const requiredIdempotencyPrefix = envText(
    "PHASE17_CANARY_IDEMPOTENCY_PREFIX",
    "phase22d-internal-canary:",
  );

  const isApprovedCanaryTemplate =
    message.type === MessageType.TEMPLATE &&
    canary.designated === true &&
    canary.kind === "INTERNAL_TEST" &&
    source === "whatsapp" &&
    hasCanaryTag &&
    outbound.templateName === "hello_world" &&
    typeof outbound.idempotencyKey === "string" &&
    outbound.idempotencyKey.startsWith(requiredIdempotencyPrefix) &&
    currentTemplateApproved;

  if (message.type !== MessageType.TEXT && !isApprovedCanaryTemplate) {
    throw new Error(
      "Controlled canary allows TEXT or the exact designated approved hello_world template only.",
    );
  }
  if (message.actor !== MessageActor.COUNSELOR) {
    throw new Error("Initial controlled canary must be a counselor-authored message.");
  }
  if (Date.now() - message.createdAt.getTime() > MAX_CANARY_MESSAGE_AGE_MS) {
    throw new Error("Canary target is stale; queue a fresh message within 30 minutes.");
  }

  const mapping = readLegacyWhatsAppMappingMetadata(message.conversation.contact.metadata);
  if (
    !mapping ||
    mapping.workspaceId !== workspaceId ||
    mapping.legacyContactId !== message.conversation.contact.id ||
    mapping.externalUserId !== message.conversation.contact.waId ||
    mapping.channel !== "WHATSAPP"
  ) {
    throw new Error("Canary target does not have an authoritative WhatsApp identity mapping.");
  }

  const connection = await prisma.engageChannelConnection.findFirst({
    where: {
      id: mapping.connectionId,
      workspaceId,
      channel: "WHATSAPP",
      status: { in: ["CONNECTED", "DEGRADED"] },
    },
    select: { id: true },
  });
  if (!connection) throw new Error("Mapped WhatsApp connection is not active.");

  return {
    messageId: message.id,
    type: message.type,
    actor: message.actor,
    status: message.status,
    createdAt: message.createdAt,
    messageTimestamp: message.messageTimestamp,
    preview: compactPreview(message.text),
    recipientMasked: maskRecipient(message.conversation.contact.waId),
    workspaceId,
    connectionId: connection.id,
  };
}

async function queuedInventory(workspaceId: string) {
  const messages = await prisma.whatsAppMessage.findMany({
    where: { direction: MessageDirection.OUTBOUND, status: MessageStatus.QUEUED },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      actor: true,
      type: true,
      text: true,
      createdAt: true,
      conversation: {
        select: {
          contact: { select: { id: true, waId: true, metadata: true } },
        },
      },
    },
  });

  return messages.flatMap((message) => {
    const mapping = readLegacyWhatsAppMappingMetadata(message.conversation.contact.metadata);
    if (!mapping || mapping.workspaceId !== workspaceId) return [];
    return [
      {
        messageId: message.id,
        actor: message.actor,
        type: message.type,
        createdAt: message.createdAt.toISOString(),
        preview: compactPreview(message.text),
        recipientMasked: maskRecipient(message.conversation.contact.waId),
        connectionId: mapping.connectionId,
      },
    ];
  });
}

async function restoreShadow(input: {
  workspaceId: string;
  expectedPromotedVersion: number;
  actorUserId: string | null;
  reason: string;
}): Promise<ControlledLaunchStateRecord> {
  const current = await prismaControlledLaunchStateRepository.getState(input.workspaceId);
  if (!current) throw new Error("Controlled-launch state disappeared before safety restore.");
  if (current.mode === "SHADOW") {
    assertShadowBaseline(current, input.workspaceId);
    return current;
  }
  if (
    current.version !== input.expectedPromotedVersion ||
    current.stage !== "ONE_CONNECTED_ACCOUNT" ||
    current.mode !== "APPROVAL_ONLY" ||
    current.writePolicy !== "HUMAN_APPROVAL_REQUIRED" ||
    !current.externalWritesAllowed ||
    !current.scope.externalWritesRequested
  ) {
    throw new Error("Safety restore refused because controlled-launch state no longer matches this canary.");
  }

  return prismaControlledLaunchStateRepository.transitionState({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    reason: input.reason,
    expectedVersion: current.version,
    stage: current.stage,
    mode: "SHADOW",
    writePolicy: "NO_EXTERNAL_WRITES",
    externalWritesAllowed: false,
    scope: buildShadowScope(current.scope),
  });
}

async function runDryRun(workspaceId: string, messageId: string | null) {
  const state = await prismaControlledLaunchStateRepository.getState(workspaceId);
  assertShadowBaseline(state, workspaceId);
  const inventory = await queuedInventory(workspaceId);
  const target = messageId ? await resolveTarget(workspaceId, messageId) : null;
  if (target) assertShadowBaseline(state, workspaceId, target.connectionId);
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
        queueCount: inventory.length,
        candidates: inventory,
        selectedTarget: target,
        externalWhatsAppWriteSent: false,
      },
      null,
      2,
    ),
  );
}

async function runRestore(workspaceId: string) {
  const baseVersion = expectedStateVersion(true)!;
  const actorUserId = envText("PHASE17_CANARY_APPROVER_USER_ID") || null;
  const restored = await restoreShadow({
    workspaceId,
    expectedPromotedVersion: baseVersion + 1,
    actorUserId,
    reason: "Phase17 single-message canary workflow safety restore",
  });
  console.log(
    JSON.stringify({
      mode: "RESTORE",
      workspaceId,
      restoredMode: restored.mode,
      restoredWritePolicy: restored.writePolicy,
      restoredExternalWritesAllowed: restored.externalWritesAllowed,
      restoredVersion: restored.version,
      externalWhatsAppWriteSent: false,
    }),
  );
}

async function runExecute(workspaceId: string) {
  const messageId = requiredEnv("PHASE17_CANARY_MESSAGE_ID");
  const approvedByUserId = requiredEnv("PHASE17_CANARY_APPROVER_USER_ID");
  const reason = requiredEnv("PHASE17_CANARY_REASON");
  const baseVersion = expectedStateVersion(true)!;
  const evidence = machineEvidence();

  if (getOutboundMode() !== "live") {
    throw new Error("Single-message canary EXECUTE requires isolated live provider gates.");
  }

  const target = await resolveTarget(workspaceId, messageId);
  const current = await prismaControlledLaunchStateRepository.getState(workspaceId);
  assertShadowBaseline(current, workspaceId, target.connectionId);
  if (current.version !== baseVersion) {
    throw new Error(
      `Controlled-launch version changed: expected ${baseVersion}, found ${current.version}.`,
    );
  }

  const membership = await prisma.engageWorkspaceMembership.findFirst({
    where: {
      workspaceId,
      userId: approvedByUserId,
      isActive: true,
      user: { isActive: true },
    },
    select: { id: true },
  });
  if (!membership) throw new Error("Canary approver is not an active workspace member.");

  const targetScope = buildApprovalScope(current, target.connectionId);
  const promoted = await transitionControlledLaunchState(
    prismaControlledLaunchStateRepository,
    {
      activeWorkspaceId: workspaceId,
      workspaceId,
      actorUserId: approvedByUserId,
      reason: `Phase17 single-message canary promotion: ${reason}`,
      expectedVersion: baseVersion,
      targetStage: "ONE_CONNECTED_ACCOUNT",
      targetMode: "APPROVAL_ONLY",
      scope: targetScope,
      evidence,
    },
  );

  let approvalId: string | null = null;
  let dispatchResult: Awaited<ReturnType<typeof dispatchOutboundMessage>> | null = null;
  let executionError: unknown = null;
  let restored: ControlledLaunchStateRecord | null = null;

  try {
    const approval = await approveControlledLaunchOutbound({
      workspaceId,
      connectionId: target.connectionId,
      messageId,
      approvedByUserId,
      reason,
      ttlMs: 10 * 60 * 1_000,
    });
    approvalId = approval.id;

    dispatchResult = await dispatchOutboundMessage(messageId);
    if (!dispatchResult.outboundSent || dispatchResult.status !== "SENT") {
      throw new Error(
        `Canary provider dispatch did not reach SENT: ${dispatchResult.status} ${dispatchResult.reason ?? ""}`.trim(),
      );
    }
  } catch (error) {
    executionError = error;
  } finally {
    if (approvalId && !dispatchResult?.outboundSent) {
      try {
        await revokeControlledLaunchOutboundApproval({
          approvalId,
          revokedByUserId: approvedByUserId,
          reason: "Canary ended without a confirmed SENT result; revoke any unconsumed approval.",
        });
      } catch (error) {
        if (
          !(error instanceof ControlledLaunchOutboundApprovalError) ||
          error.code !== "APPROVAL_ALREADY_CONSUMED"
        ) {
          executionError ??= error;
        }
      }
    }

    try {
      restored = await restoreShadow({
        workspaceId,
        expectedPromotedVersion: promoted.version,
        actorUserId: approvedByUserId,
        reason: "Phase17 single-message canary completed; restore SHADOW/no-external-writes",
      });
    } catch (error) {
      executionError = error;
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: "EXECUTE",
        workspaceId,
        messageId: target.messageId,
        messageType: target.type,
        recipientMasked: target.recipientMasked,
        preview: target.preview,
        connectionId: target.connectionId,
        approvalId,
        dispatch: dispatchResult
          ? {
              outboundSent: dispatchResult.outboundSent,
              status: dispatchResult.status,
              retriable: dispatchResult.retriable,
              reason: dispatchResult.reason,
              metaMessageIdPresent: Boolean(dispatchResult.metaMessageId),
            }
          : null,
        restored: restored
          ? {
              mode: restored.mode,
              writePolicy: restored.writePolicy,
              externalWritesAllowed: restored.externalWritesAllowed,
              version: restored.version,
            }
          : null,
      },
      null,
      2,
    ),
  );

  if (executionError) throw executionError;
}

async function main() {
  const mode = canaryMode();
  const workspaceId = envText("PHASE17_CANARY_WORKSPACE_ID", DEFAULT_WORKSPACE_ID);
  const messageId = envText("PHASE17_CANARY_MESSAGE_ID") || null;

  if (mode === "DRY_RUN") return runDryRun(workspaceId, messageId);
  if (mode === "RESTORE") return runRestore(workspaceId);
  return runExecute(workspaceId);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
