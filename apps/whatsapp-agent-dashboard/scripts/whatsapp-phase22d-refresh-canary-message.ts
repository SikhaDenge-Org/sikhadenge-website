import {
  MessageActor,
  MessageDirection,
  MessageStatus,
  MessageType,
  TemplateStatus,
} from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { queueOutboundMessage } from "@/lib/outbound/outbound-service";

const WORKSPACE_ID = "engagews_default";
const CANARY_TAG = "CANARY_INTERNAL_TEST";
const MAX_CANARY_AGE_MS = 30 * 60 * 1000;
const SUPERSEDE_CODE = "CANARY_SUPERSEDED";

function required(name: string): string {
  const value = (process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hasTemplateVariables(value: unknown): boolean {
  if (typeof value === "string") return /{{\s*\d+\s*}}/.test(value);
  if (Array.isArray(value)) return value.some(hasTemplateVariables);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasTemplateVariables);
  }
  return false;
}

async function main() {
  const waId = required("PHASE22D_VERIFIED_CANARY_WA_ID");
  const staleMessageId = required("PHASE22D_STALE_MESSAGE_ID");
  const confirmation = required("PHASE22D_REFRESH_CONFIRM");
  if (!/^\d{6,20}$/.test(waId)) throw new Error("Verified canary waId is malformed.");
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(staleMessageId)) throw new Error("Stale canary message ID is malformed.");
  if (confirmation !== "REFRESH_ONE_STALE_INTERNAL_CANARY_MESSAGE") {
    throw new Error("Explicit Phase22D refresh confirmation is missing.");
  }
  if ((process.env.WHATSAPP_OUTBOUND_MODE ?? "disabled").trim().toLowerCase() === "live") {
    throw new Error("Refresh requires base outbound mode to remain non-live.");
  }
  if ((process.env.WHATSAPP_OUTBOUND_KILL_SWITCH ?? "on").trim().toLowerCase() !== "on") {
    throw new Error("Refresh requires the outbound kill switch to remain on.");
  }

  const state = await prisma.engageControlledLaunchState.findUnique({
    where: { workspaceId: WORKSPACE_ID },
    select: {
      stage: true,
      mode: true,
      writePolicy: true,
      externalWritesAllowed: true,
      scope: true,
      version: true,
    },
  });
  if (
    !state ||
    state.stage !== "ONE_CONNECTED_ACCOUNT" ||
    state.mode !== "SHADOW" ||
    state.writePolicy !== "NO_EXTERNAL_WRITES" ||
    state.externalWritesAllowed
  ) {
    throw new Error("Controlled-launch state is not fail-closed SHADOW.");
  }
  const stateScope = record(state.scope);
  if (stateScope.externalWritesRequested === true) {
    throw new Error("Controlled-launch scope currently requests external writes.");
  }

  const stale = await prisma.whatsAppMessage.findUnique({
    where: { id: staleMessageId },
    select: {
      id: true,
      status: true,
      type: true,
      direction: true,
      actor: true,
      metaMessageId: true,
      createdAt: true,
      rawPayload: true,
      failureCode: true,
      conversation: {
        select: {
          id: true,
          source: true,
          tags: { select: { tag: { select: { name: true } } } },
          contact: {
            select: {
              id: true,
              waId: true,
              optedOutAt: true,
              metadata: true,
            },
          },
        },
      },
    },
  });
  if (!stale) throw new Error("Stale canary message was not found.");
  if (stale.type !== MessageType.TEMPLATE || stale.direction !== MessageDirection.OUTBOUND) {
    throw new Error("Refresh target must be an outbound TEMPLATE message.");
  }
  if (stale.actor !== MessageActor.COUNSELOR) {
    throw new Error("Refresh target must be counselor-authored.");
  }
  if (stale.metaMessageId) {
    throw new Error("Refresh target already has a provider message ID.");
  }
  if (stale.conversation.contact.waId !== waId) {
    throw new Error("Refresh target is not bound to the verified canary waId.");
  }
  if (stale.conversation.contact.optedOutAt) {
    throw new Error("Verified canary is opted out.");
  }
  const source = stale.conversation.source?.trim().toLowerCase() || "whatsapp";
  if (source !== "whatsapp") throw new Error("Refresh target is not a WhatsApp conversation.");
  if (!stale.conversation.tags.some((link) => link.tag.name === CANARY_TAG)) {
    throw new Error("Refresh target conversation is missing the internal canary tag.");
  }

  const contactMetadata = record(stale.conversation.contact.metadata);
  const engageos = record(contactMetadata.engageos);
  const identity = record(engageos.whatsappIdentity);
  const canary = record(engageos.canary);
  if (
    identity.workspaceId !== WORKSPACE_ID ||
    canary.designated !== true ||
    canary.kind !== "INTERNAL_TEST"
  ) {
    throw new Error("Verified contact is not the designated internal canary.");
  }

  const rawPayload = record(stale.rawPayload);
  const outbound = record(rawPayload.outbound);
  const templateId = typeof outbound.templateId === "string" ? outbound.templateId : "";
  const priorIdempotencyKey =
    typeof outbound.idempotencyKey === "string" ? outbound.idempotencyKey : "";
  if (
    outbound.templateName !== "hello_world" ||
    !priorIdempotencyKey.startsWith("phase22d-internal-canary:") ||
    !templateId
  ) {
    throw new Error("Refresh target is not the exact Phase22D hello_world canary lineage.");
  }

  const template = await prisma.whatsAppTemplate.findUnique({
    where: { id: templateId },
    select: { id: true, name: true, language: true, status: true, components: true },
  });
  if (
    !template ||
    template.name !== "hello_world" ||
    template.language !== "en_US" ||
    template.status !== TemplateStatus.APPROVED ||
    hasTemplateVariables(template.components)
  ) {
    throw new Error("Current hello_world template is not approved zero-variable en_US.");
  }

  const activeApprovals = await prisma.engageControlledLaunchOutboundApproval.count({
    where: {
      workspaceId: WORKSPACE_ID,
      messageId: staleMessageId,
      consumedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (activeApprovals !== 0) {
    throw new Error("Stale canary still has an active outbound approval.");
  }

  const freshIdempotencyKey =
    `phase22d-internal-canary:${waId}:${template.id}:refresh:${staleMessageId}`;

  const existingFresh = await prisma.whatsAppMessage.findFirst({
    where: {
      conversationId: stale.conversation.id,
      direction: MessageDirection.OUTBOUND,
      rawPayload: {
        path: ["outbound", "idempotencyKey"],
        equals: freshIdempotencyKey,
      },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      metaMessageId: true,
      createdAt: true,
    },
  });

  if (existingFresh) {
    if (
      existingFresh.status !== MessageStatus.QUEUED ||
      existingFresh.metaMessageId ||
      Date.now() - existingFresh.createdAt.getTime() > MAX_CANARY_AGE_MS
    ) {
      throw new Error("Existing refreshed canary is not a fresh unsent QUEUED message.");
    }
    console.log(
      JSON.stringify(
        {
          mode: "REFRESH",
          refreshed: false,
          duplicate: true,
          staleMessageId,
          staleMessageStatus: stale.status,
          messageId: existingFresh.id,
          messageStatus: existingFresh.status,
          freshIdempotencyKey,
          controlledLaunchVersion: state.version,
          externalWhatsAppWriteSent: false,
        },
        null,
        2,
      ),
    );
    return;
  }

  const staleAgeMs = Date.now() - stale.createdAt.getTime();
  const recoverableSuperseded =
    stale.status === MessageStatus.FAILED && stale.failureCode === SUPERSEDE_CODE;
  if (!recoverableSuperseded) {
    if (stale.status !== MessageStatus.QUEUED) {
      throw new Error(`Refresh target is ${stale.status}, not QUEUED.`);
    }
    if (staleAgeMs <= MAX_CANARY_AGE_MS) {
      throw new Error("Refresh target is not stale yet.");
    }

    await prisma.$transaction([
      prisma.whatsAppMessage.update({
        where: { id: staleMessageId },
        data: {
          status: MessageStatus.FAILED,
          failureCode: SUPERSEDE_CODE,
          failureReason: "Superseded by a fresh Phase22D internal canary before provider dispatch.",
        },
      }),
      prisma.whatsAppMessageStatusEvent.create({
        data: {
          messageId: staleMessageId,
          status: MessageStatus.FAILED,
          rawPayload: {
            reason: SUPERSEDE_CODE,
            externalWhatsAppWriteSent: false,
          },
        },
      }),
      prisma.auditLog.create({
        data: {
          action: "PHASE22D_CANARY_SUPERSEDED",
          entityType: "WhatsAppMessage",
          entityId: staleMessageId,
          before: { status: "QUEUED", metaMessageId: null },
          after: {
            status: "FAILED",
            failureCode: SUPERSEDE_CODE,
            replacementIdempotencyKey: freshIdempotencyKey,
            externalWhatsAppWriteSent: false,
          },
        },
      }),
    ]);
  }

  const queued = await queueOutboundMessage({
    conversationId: stale.conversation.id,
    actor: MessageActor.COUNSELOR,
    sentById: null,
    content: {
      kind: "template",
      templateId: template.id,
      components: [],
    },
    idempotencyKey: freshIdempotencyKey,
  });

  let freshMessageId = queued.message?.id ?? null;
  if (queued.duplicate || !freshMessageId) {
    const duplicate = await prisma.whatsAppMessage.findFirst({
      where: {
        conversationId: stale.conversation.id,
        direction: MessageDirection.OUTBOUND,
        rawPayload: {
          path: ["outbound", "idempotencyKey"],
          equals: freshIdempotencyKey,
        },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, metaMessageId: true, createdAt: true },
    });
    if (
      !duplicate ||
      duplicate.status !== MessageStatus.QUEUED ||
      duplicate.metaMessageId ||
      Date.now() - duplicate.createdAt.getTime() > MAX_CANARY_AGE_MS
    ) {
      throw new Error("Fresh canary duplicate could not be resolved safely.");
    }
    freshMessageId = duplicate.id;
  }

  console.log(
    JSON.stringify(
      {
        mode: "REFRESH",
        refreshed: true,
        duplicate: queued.duplicate,
        staleMessageId,
        staleMessageStatus: MessageStatus.FAILED,
        messageId: freshMessageId,
        messageStatus: MessageStatus.QUEUED,
        freshIdempotencyKey,
        controlledLaunchVersion: state.version,
        externalWhatsAppWriteSent: false,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
