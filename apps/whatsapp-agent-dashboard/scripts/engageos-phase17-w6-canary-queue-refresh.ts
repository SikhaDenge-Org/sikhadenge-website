import {
  MessageActor,
  MessageDirection,
  MessageStatus,
  MessageType,
  Prisma,
  TemplateStatus,
} from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { queueOutboundMessage } from "@/lib/outbound/outbound-service";

const WORKSPACE_ID = "engagews_default";
const CANARY_TAG = "CANARY_INTERNAL_TEST";
const IDEMPOTENCY_PREFIX = "phase17-w5-internal-canary";
const REFRESH_IF_OLDER_THAN_MS = 10 * 60 * 1_000;
const MAX_W6_AGE_MS = 30 * 60 * 1_000;

type RefreshMode = "DRY_RUN" | "REFRESH";

type Candidate = {
  id: string;
  status: MessageStatus;
  metaMessageId: string | null;
  rawPayload: Prisma.JsonValue | null;
  createdAt: Date;
};

function required(name: string): string {
  const value = (process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function mode(): RefreshMode {
  const value = (process.env.W6_REFRESH_MODE ?? "DRY_RUN").trim().toUpperCase();
  if (value === "DRY_RUN" || value === "REFRESH") return value;
  throw new Error("W6_REFRESH_MODE must be DRY_RUN or REFRESH.");
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function hasTemplateVariables(value: unknown): boolean {
  if (typeof value === "string") return /{{\s*\d+\s*}}/.test(value);
  if (Array.isArray(value)) return value.some(hasTemplateVariables);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasTemplateVariables);
  }
  return false;
}

function outbound(candidate: Candidate): Record<string, unknown> {
  return record(record(candidate.rawPayload).outbound);
}

function idempotencyKey(candidate: Candidate): string {
  const value = outbound(candidate).idempotencyKey;
  return typeof value === "string" ? value : "";
}

function generation(key: string, exactPrefix: string): number | null {
  if (!key.startsWith(exactPrefix)) return null;
  const suffix = key.slice(exactPrefix.length);
  if (!/^\d+$/.test(suffix)) return null;
  const parsed = Number(suffix);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
}

function ageMs(value: Date): number {
  return Math.max(0, Date.now() - value.getTime());
}

async function supersede(messageId: string) {
  await prisma.$transaction(async (transaction) => {
    const current = await transaction.whatsAppMessage.findUnique({
      where: { id: messageId },
      select: { status: true, metaMessageId: true },
    });
    if (!current) throw new Error("Stale W5 canary disappeared before supersession.");
    if (current.status !== MessageStatus.QUEUED || current.metaMessageId) {
      throw new Error("Stale W5 canary changed state before supersession.");
    }

    await transaction.whatsAppMessage.update({
      where: { id: messageId },
      data: {
        status: MessageStatus.FAILED,
        failureCode: "W6_CANARY_SUPERSEDED",
        failureReason: "Stale unsent internal canary superseded before provider dispatch.",
      },
    });
    await transaction.whatsAppMessageStatusEvent.create({
      data: {
        messageId,
        status: MessageStatus.FAILED,
        metaTimestamp: new Date(),
        rawPayload: toJson({
          source: "w6_canary_queue_refresh",
          reason: "stale_unsent_internal_canary_superseded",
          providerWriteRequested: false,
          externalWhatsAppWriteSent: false,
        }),
      },
    });
  });
}

async function loadCandidates(conversationId: string, templateId: string) {
  const exactPrefix = `${IDEMPOTENCY_PREFIX}:${conversationId}:${templateId}:v`;
  const rows = await prisma.whatsAppMessage.findMany({
    where: {
      conversationId,
      direction: MessageDirection.OUTBOUND,
      type: MessageType.TEMPLATE,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      status: true,
      metaMessageId: true,
      rawPayload: true,
      createdAt: true,
    },
  });
  return {
    exactPrefix,
    candidates: rows.filter((row) => {
      const candidate = row as Candidate;
      const out = outbound(candidate);
      return (
        idempotencyKey(candidate).startsWith(exactPrefix) &&
        out.templateId === templateId &&
        out.templateName === "hello_world"
      );
    }) as Candidate[],
  };
}

async function main() {
  const action = mode();
  const waId = required("W6_REFRESH_VERIFIED_CANARY_WA_ID");
  const templateName = required("W6_REFRESH_TEMPLATE_NAME");
  if (!/^\d{6,20}$/.test(waId)) throw new Error("Verified canary waId is malformed.");
  if (!/^[a-z0-9_]{1,512}$/.test(templateName)) throw new Error("Template name is malformed.");

  const contact = await prisma.whatsAppContact.findUnique({
    where: { waId },
    select: {
      consentStatus: true,
      optedOutAt: true,
      metadata: true,
      conversations: {
        orderBy: [{ createdAt: "asc" }],
        select: {
          id: true,
          source: true,
          tags: { select: { tag: { select: { name: true } } } },
        },
      },
    },
  });
  if (!contact) throw new Error("Verified internal canary contact was not found.");

  const engageos = record(record(contact.metadata).engageos);
  const identity = record(engageos.whatsappIdentity);
  const canary = record(engageos.canary);
  if (
    identity.workspaceId !== WORKSPACE_ID ||
    canary.designated !== true ||
    canary.kind !== "INTERNAL_TEST"
  ) {
    throw new Error("Verified contact is not the designated internal canary.");
  }
  if (contact.consentStatus !== "OPTED_IN") throw new Error("Verified canary is not opted in.");
  if (contact.optedOutAt) throw new Error("Verified canary is opted out.");

  const conversation =
    contact.conversations.find((item) => {
      const source = item.source?.trim().toLowerCase() || "whatsapp";
      return source === "whatsapp" && item.tags.some((link) => link.tag.name === CANARY_TAG);
    }) ?? null;
  if (!conversation) throw new Error("Designated internal canary conversation is missing.");

  const template = await prisma.whatsAppTemplate.findUnique({
    where: { name: templateName },
    select: { id: true, name: true, language: true, status: true, components: true },
  });
  if (
    !template ||
    template.status !== TemplateStatus.APPROVED ||
    template.name !== "hello_world" ||
    template.language !== "en_US" ||
    hasTemplateVariables(template.components)
  ) {
    throw new Error("Exact approved zero-variable hello_world/en_US template is required.");
  }

  const launch = await prisma.engageControlledLaunchState.findUnique({
    where: { workspaceId: WORKSPACE_ID },
    select: { externalWritesAllowed: true, scope: true },
  });
  if (!launch) throw new Error("Controlled-launch state is missing.");
  const launchScope = record(launch.scope);
  if (launch.externalWritesAllowed || launchScope.externalWritesRequested === true) {
    throw new Error("Controlled-launch external writes must remain disabled.");
  }

  let { exactPrefix, candidates } = await loadCandidates(conversation.id, template.id);
  if (candidates.some((candidate) => candidate.metaMessageId)) {
    throw new Error("W5 namespace contains a provider message ID; refresh is refused.");
  }
  if (
    candidates.some(
      (candidate) =>
        candidate.status === MessageStatus.SENT ||
        candidate.status === MessageStatus.DELIVERED ||
        candidate.status === MessageStatus.READ,
    )
  ) {
    throw new Error("W5 namespace contains prior provider-delivery state; refresh is refused.");
  }

  let queued = candidates.filter((candidate) => candidate.status === MessageStatus.QUEUED);
  if (queued.length > 2) throw new Error("More than two active W5 canaries exist; manual review required.");

  const newestQueued = queued.at(-1) ?? null;
  const newestAge = newestQueued ? ageMs(newestQueued.createdAt) : null;
  const refreshRequired = !newestQueued || newestAge! > REFRESH_IF_OLDER_THAN_MS || queued.length === 2;

  console.log("W6_REFRESH_TARGET_READY=true");
  console.log("W6_REFRESH_TEMPLATE_READY=true");
  console.log(`W6_REFRESH_ACTIVE_QUEUE_COUNT_BEFORE=${queued.length}`);
  console.log(`W6_REFRESH_REQUIRED=${refreshRequired ? "true" : "false"}`);
  console.log("W6_REFRESH_PROVIDER_WRITE_REQUESTED=false");
  console.log("W6_REFRESH_EXTERNAL_WHATSAPP_WRITE_SENT=false");
  console.log("W6_REFRESH_IDENTIFIER_EMITTED=false");

  if (action === "DRY_RUN") {
    if (queued.length === 2) {
      const older = queued[0]!;
      const newer = queued[1]!;
      if (ageMs(older.createdAt) <= REFRESH_IF_OLDER_THAN_MS || ageMs(newer.createdAt) > MAX_W6_AGE_MS) {
        throw new Error("Two-queue recovery shape is not older-stale plus newer-fresh.");
      }
    }
    console.log("W6_REFRESH_DRY_RUN=PASS");
    console.log("W6_REFRESH_DATABASE_WRITE_REQUESTED=false");
    return;
  }

  const confirmation = required("W6_REFRESH_CONFIRM");
  if (confirmation !== "REFRESH_ONE_STALE_W5_INTERNAL_CANARY_QUEUE") {
    throw new Error("Explicit W6 queue-refresh confirmation is missing.");
  }

  if (queued.length === 2) {
    const older = queued[0]!;
    const newer = queued[1]!;
    if (ageMs(older.createdAt) <= REFRESH_IF_OLDER_THAN_MS || ageMs(newer.createdAt) > MAX_W6_AGE_MS) {
      throw new Error("Two-queue recovery shape is not older-stale plus newer-fresh.");
    }
    await supersede(older.id);
    console.log("W6_REFRESH_RECOVERED_PARTIAL_PREVIOUS_RUN=true");
  } else if (queued.length === 1 && newestAge !== null && newestAge <= REFRESH_IF_OLDER_THAN_MS) {
    console.log("W6_REFRESH_ALREADY_FRESH=true");
  } else {
    const maxGeneration = candidates.reduce((maximum, candidate) => {
      const parsed = generation(idempotencyKey(candidate), exactPrefix);
      return parsed === null ? maximum : Math.max(maximum, parsed);
    }, 0);
    const nextGeneration = maxGeneration + 1;
    const nextKey = `${exactPrefix}${nextGeneration}`;

    const queuedResult = await queueOutboundMessage({
      conversationId: conversation.id,
      actor: MessageActor.COUNSELOR,
      sentById: null,
      content: {
        kind: "template",
        templateId: template.id,
        components: [],
      },
      idempotencyKey: nextKey,
    });
    if (queuedResult.duplicate || !queuedResult.message?.id) {
      throw new Error("Fresh W6 canary queue creation did not create a new canonical message.");
    }
    if (queuedResult.message.status !== MessageStatus.QUEUED) {
      throw new Error("Fresh W6 canary queue record is not QUEUED.");
    }

    if (queued.length === 1) {
      await supersede(queued[0]!.id);
      console.log("W6_REFRESH_SUPERSEDED_STALE_QUEUE=true");
    }
    console.log("W6_REFRESH_CREATED_FRESH_QUEUE=true");
  }

  ({ exactPrefix, candidates } = await loadCandidates(conversation.id, template.id));
  queued = candidates.filter((candidate) => candidate.status === MessageStatus.QUEUED);
  if (queued.length !== 1) throw new Error("W6 refresh must finish with exactly one active W5 queue record.");
  if (queued[0]!.metaMessageId) throw new Error("Fresh W6 canary unexpectedly has a provider message ID.");
  if (ageMs(queued[0]!.createdAt) > MAX_W6_AGE_MS) {
    throw new Error("W6 refresh did not produce a canary inside the 30-minute freshness window.");
  }
  const finalGeneration = generation(idempotencyKey(queued[0]!), exactPrefix);
  if (finalGeneration === null) throw new Error("Fresh W6 canary generation is malformed.");

  const finalLaunch = await prisma.engageControlledLaunchState.findUnique({
    where: { workspaceId: WORKSPACE_ID },
    select: { externalWritesAllowed: true, scope: true },
  });
  if (!finalLaunch) throw new Error("Controlled-launch state disappeared after refresh.");
  const finalScope = record(finalLaunch.scope);
  if (finalLaunch.externalWritesAllowed || finalScope.externalWritesRequested === true) {
    throw new Error("Controlled-launch external writes changed during refresh.");
  }

  console.log("W6_REFRESH_ACTIVE_QUEUE_COUNT=1");
  console.log("W6_REFRESH_META_MESSAGE_ID_SET=false");
  console.log("W6_REFRESH_CONTROLLED_LAUNCH_FAIL_CLOSED=true");
  console.log("W6_REFRESH_PROVIDER_WRITE_REQUESTED=false");
  console.log("W6_REFRESH_EXTERNAL_WHATSAPP_WRITE_SENT=false");
  console.log("W6_REFRESH=PASS");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
