import { MessageActor, Prisma } from "@prisma/client";
import { createHash } from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import { queueOutboundMessage } from "@/lib/outbound/outbound-service";
import { readLegacyWhatsAppMappingMetadata } from "@/modules/channels/whatsapp/application/legacy-identity-mapping";
import {
  cancelJourneyEnrollment,
  createJourneyEnrollment,
  evaluateNextJourneyStep,
  journeyStepIdempotencyKey,
  recordJourneyStepSent,
  type JourneyEnrollment,
  type JourneyStep,
} from "@/modules/journeys/application/journey-runtime";
import type { QuietHours } from "@/modules/journeys/domain/journey-policy";

const ENROLLMENT_EVENT_TYPE = "journey_runtime_enrollment";
const ACTION_EVENT_TYPE = "journey_runtime_action";
const DEFAULT_QUIET_HOURS: QuietHours = { startMinuteOfDay: 22 * 60, endMinuteOfDay: 8 * 60 };
const DEFAULT_FREQUENCY_CAP = 5;

type DurableJourneyEnrollment = JourneyEnrollment & {
  conversationId: string;
  baselineLeadStage: string | null;
  quietHours: QuietHours;
  maxSendsInFrequencyWindow: number;
  lastEvaluatedAt: string | null;
  lastDecision: string | null;
  queuedMessageIds: string[];
};

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function clean(value: unknown, maximum = 500): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function boolEnv(name: string, fallback = false) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (["1", "true", "yes", "on", "enabled"].includes(value)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(value)) return false;
  return fallback;
}

export function getJourneyRuntimeStatus() {
  return {
    runtimeEnabled: boolEnv("JOURNEY_RUNTIME_ENABLED", false),
    actionExecutionEnabled: boolEnv("JOURNEY_ACTIONS_ENABLED", false),
  };
}

function enrollmentKey(journeyId: string, customerId: string) {
  const digest = createHash("sha256").update(`${journeyId}:${customerId}`).digest("hex");
  return `journey-runtime:${digest}`;
}

function actionEventKey(enrollment: DurableJourneyEnrollment, step: JourneyStep) {
  return `journey-runtime-action:${createHash("sha256")
    .update(journeyStepIdempotencyKey(enrollment, step))
    .digest("hex")}`;
}

function parseDate(value: unknown, fallback = new Date()) {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  return Number.isFinite(date.getTime()) ? date : fallback;
}

function parseEnrollment(value: unknown): DurableJourneyEnrollment {
  const row = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const steps = Array.isArray(row.steps)
    ? row.steps.map((item) => {
        const step = item as Record<string, unknown>;
        return {
          id: clean(step.id, 100),
          offsetMinutes: Math.max(0, Math.floor(Number(step.offsetMinutes) || 0)),
          channel: clean(step.channel, 30),
          messageReference: clean(step.messageReference, 4200),
        };
      })
    : [];
  return {
    id: clean(row.id, 250),
    journeyId: clean(row.journeyId, 120),
    customerId: clean(row.customerId, 120),
    conversationId: clean(row.conversationId, 120),
    enrolledAt: parseDate(row.enrolledAt),
    status: clean(row.status, 30) as DurableJourneyEnrollment["status"],
    steps,
    nextStepIndex: Math.max(0, Math.floor(Number(row.nextStepIndex) || 0)),
    sentStepIds: Array.isArray(row.sentStepIds) ? row.sentStepIds.filter((item): item is string => typeof item === "string") : [],
    cancelledReason: clean(row.cancelledReason, 500) || undefined,
    baselineLeadStage: clean(row.baselineLeadStage, 60) || null,
    quietHours: {
      startMinuteOfDay: Math.max(0, Math.min(1439, Math.floor(Number((row.quietHours as Record<string, unknown> | undefined)?.startMinuteOfDay) || DEFAULT_QUIET_HOURS.startMinuteOfDay))),
      endMinuteOfDay: Math.max(0, Math.min(1439, Math.floor(Number((row.quietHours as Record<string, unknown> | undefined)?.endMinuteOfDay) || DEFAULT_QUIET_HOURS.endMinuteOfDay))),
    },
    maxSendsInFrequencyWindow: Math.max(1, Math.min(50, Math.floor(Number(row.maxSendsInFrequencyWindow) || DEFAULT_FREQUENCY_CAP))),
    lastEvaluatedAt: clean(row.lastEvaluatedAt, 60) || null,
    lastDecision: clean(row.lastDecision, 500) || null,
    queuedMessageIds: Array.isArray(row.queuedMessageIds) ? row.queuedMessageIds.filter((item): item is string => typeof item === "string") : [],
  };
}

function localMinute(now: Date, timeZone = "Asia/Kolkata") {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function contentFromReference(reference: string) {
  if (reference.startsWith("template:")) {
    const templateId = clean(reference.slice("template:".length), 100);
    if (!templateId) throw new Error("Journey template reference is empty.");
    return { kind: "template" as const, templateId };
  }
  if (reference.startsWith("text:")) {
    const text = clean(reference.slice("text:".length), 4096);
    if (!text) throw new Error("Journey text reference is empty.");
    return { kind: "text" as const, text };
  }
  throw new Error("Journey messageReference must start with text: or template:.");
}

async function persistEnrollment(eventKey: string, enrollment: DurableJourneyEnrollment) {
  await prisma.webhookEvent.update({
    where: { eventKey },
    data: {
      payload: json(enrollment),
      processedAt: enrollment.status === "ACTIVE" ? null : new Date(),
      processingError: null,
    },
  });
}

export async function enrollJourney(input: {
  journeyId: string;
  conversationId: string;
  steps: readonly JourneyStep[];
  actorId: string;
  quietHours?: QuietHours;
  maxSendsInFrequencyWindow?: number;
  now?: Date;
}) {
  const status = getJourneyRuntimeStatus();
  if (!status.runtimeEnabled) throw new Error("Journey runtime is disabled.");

  const conversation = await prisma.whatsAppConversation.findUnique({
    where: { id: clean(input.conversationId, 120) },
    select: {
      id: true,
      contactId: true,
      lead: { select: { stage: true } },
    },
  });
  if (!conversation) throw new Error("Journey conversation not found.");

  const base = createJourneyEnrollment({
    journeyId: clean(input.journeyId, 120),
    customerId: conversation.contactId,
    steps: input.steps,
    enrolledAt: input.now ?? new Date(),
  });
  const eventKey = enrollmentKey(base.journeyId, base.customerId);
  const existing = await prisma.webhookEvent.findUnique({ where: { eventKey } });
  if (existing) return { enrollment: parseEnrollment(existing.payload), duplicate: true };

  const enrollment: DurableJourneyEnrollment = {
    ...base,
    conversationId: conversation.id,
    baselineLeadStage: conversation.lead?.stage ?? null,
    quietHours: input.quietHours ?? DEFAULT_QUIET_HOURS,
    maxSendsInFrequencyWindow: Math.max(1, Math.min(50, Math.floor(input.maxSendsInFrequencyWindow ?? DEFAULT_FREQUENCY_CAP))),
    lastEvaluatedAt: null,
    lastDecision: null,
    queuedMessageIds: [],
  };

  await prisma.$transaction([
    prisma.webhookEvent.create({
      data: {
        eventKey,
        eventType: ENROLLMENT_EVENT_TYPE,
        payload: json(enrollment),
        attemptCount: 0,
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "JOURNEY_ENROLLED",
        entityType: "JourneyEnrollment",
        entityId: enrollment.id,
        after: json({
          journeyId: enrollment.journeyId,
          conversationId: enrollment.conversationId,
          steps: enrollment.steps.length,
        }),
      },
    }),
  ]);
  return { enrollment, duplicate: false };
}

async function policyContext(enrollment: DurableJourneyEnrollment, now: Date) {
  const conversation = await prisma.whatsAppConversation.findUnique({
    where: { id: enrollment.conversationId },
    select: {
      contactId: true,
      contact: { select: { consentStatus: true, metadata: true } },
      lead: { select: { stage: true } },
      messages: {
        where: {
          direction: "INBOUND",
          messageTimestamp: { gt: enrollment.enrolledAt },
        },
        take: 1,
        select: { id: true },
      },
    },
  });
  if (!conversation) throw new Error("Journey conversation no longer exists.");

  const mapping = readLegacyWhatsAppMappingMetadata(conversation.contact.metadata);
  const refs = [conversation.contactId, mapping?.customerRef].filter((value): value is string => Boolean(value));
  const suppression = await prisma.engageCustomerSuppression.findFirst({
    where: {
      workspaceId: mapping?.workspaceId ?? "engagews_default",
      customerRef: { in: refs },
      startsAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      AND: [
        { OR: [{ revokedAt: null }, { revokedAt: { gt: now } }] },
        { OR: [{ channel: null }, { channel: "WHATSAPP" }] },
      ],
    },
    select: { id: true },
  });
  const sendsInFrequencyWindow = await prisma.webhookEvent.count({
    where: {
      eventType: ACTION_EVENT_TYPE,
      receivedAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) },
      payload: { path: ["conversationId"], equals: enrollment.conversationId },
    },
  });

  return {
    suppressed: Boolean(suppression),
    consentGranted: conversation.contact.consentStatus === "OPTED_IN",
    customerRespondedSinceEnrollment: conversation.messages.length > 0,
    stageChangedSinceEnrollment: Boolean(
      enrollment.baselineLeadStage &&
      conversation.lead?.stage &&
      enrollment.baselineLeadStage !== conversation.lead.stage,
    ),
    sendsInFrequencyWindow,
  };
}

export async function processJourneyEnrollment(input: {
  journeyId: string;
  conversationId: string;
  actorId: string;
  now?: Date;
}) {
  const runtime = getJourneyRuntimeStatus();
  if (!runtime.runtimeEnabled) throw new Error("Journey runtime is disabled.");
  if (!runtime.actionExecutionEnabled) throw new Error("Journey action execution is disabled.");

  const conversation = await prisma.whatsAppConversation.findUnique({
    where: { id: clean(input.conversationId, 120) },
    select: { contactId: true },
  });
  if (!conversation) throw new Error("Journey conversation not found.");

  const eventKey = enrollmentKey(clean(input.journeyId, 120), conversation.contactId);
  const event = await prisma.webhookEvent.findUnique({ where: { eventKey } });
  if (!event || event.eventType !== ENROLLMENT_EVENT_TYPE) throw new Error("Journey enrollment not found.");

  let enrollment = parseEnrollment(event.payload);
  if (enrollment.status !== "ACTIVE") {
    return { enrollment, replayed: true, outboundSent: false };
  }

  const now = input.now ?? new Date();
  const context = await policyContext(enrollment, now);
  const evaluated = evaluateNextJourneyStep({
    enrollment,
    now,
    nowLocalMinuteOfDay: localMinute(now),
    quietHours: enrollment.quietHours,
    suppressed: context.suppressed,
    consentGranted: context.consentGranted,
    customerRespondedSinceEnrollment: context.customerRespondedSinceEnrollment,
    stageChangedSinceEnrollment: context.stageChangedSinceEnrollment,
    sendsInFrequencyWindow: context.sendsInFrequencyWindow,
    maxSendsInFrequencyWindow: enrollment.maxSendsInFrequencyWindow,
  });

  enrollment.lastEvaluatedAt = now.toISOString();
  enrollment.lastDecision = evaluated.decision.allowed ? "ALLOWED" : evaluated.decision.reason;

  if (!evaluated.decision.allowed) {
    if (evaluated.decision.cancel) {
      enrollment = {
        ...enrollment,
        ...cancelJourneyEnrollment(enrollment, evaluated.decision.reason),
        lastEvaluatedAt: now.toISOString(),
        lastDecision: evaluated.decision.reason,
      };
    }
    await persistEnrollment(eventKey, enrollment);
    return { enrollment, replayed: false, outboundSent: false };
  }

  const step = evaluated.step;
  if (!step) throw new Error("Journey has no executable step.");
  if (step.channel.trim().toUpperCase() !== "WHATSAPP") {
    throw new Error("Phase9 Journey runtime currently supports WHATSAPP steps only.");
  }

  const queued = await queueOutboundMessage({
    conversationId: enrollment.conversationId,
    actor: MessageActor.AI,
    content: contentFromReference(step.messageReference),
    idempotencyKey: journeyStepIdempotencyKey(enrollment, step),
    flowProvenance: {
      flowType: "AUTOMATION",
      flowId: `journey:${enrollment.journeyId}`,
      flowVersion: 1,
    },
    now,
  });

  if (queued.message?.id) {
    enrollment.queuedMessageIds = [...new Set([...enrollment.queuedMessageIds, queued.message.id])];
  }

  enrollment = {
    ...enrollment,
    ...recordJourneyStepSent(enrollment, step.id),
    queuedMessageIds: enrollment.queuedMessageIds,
    lastEvaluatedAt: now.toISOString(),
    lastDecision: queued.duplicate ? "IDEMPOTENT_REPLAY" : "QUEUED",
  };
  await persistEnrollment(eventKey, enrollment);

  await prisma.webhookEvent.create({
    data: {
      eventKey: actionEventKey(enrollment, step),
      eventType: ACTION_EVENT_TYPE,
      payload: json({
        journeyId: enrollment.journeyId,
        conversationId: enrollment.conversationId,
        stepId: step.id,
        messageId: queued.message?.id ?? null,
        duplicate: queued.duplicate,
      }),
      attemptCount: 1,
      processedAt: new Date(),
    },
  }).catch(() => undefined);

  await prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      action: "JOURNEY_STEP_QUEUED",
      entityType: "JourneyEnrollment",
      entityId: enrollment.id,
      after: json({
        journeyId: enrollment.journeyId,
        stepId: step.id,
        duplicate: queued.duplicate,
        status: enrollment.status,
      }),
    },
  });

  return { enrollment, replayed: queued.duplicate, outboundSent: false };
}


export async function processDueJourneys(input: {
  actorId: string;
  limit?: number;
  now?: Date;
}) {
  const runtime = getJourneyRuntimeStatus();
  if (!runtime.runtimeEnabled) throw new Error("Journey runtime is disabled.");
  if (!runtime.actionExecutionEnabled) throw new Error("Journey action execution is disabled.");

  const limit = Math.max(1, Math.min(50, Math.floor(input.limit ?? 20)));
  const events = await prisma.webhookEvent.findMany({
    where: {
      eventType: ENROLLMENT_EVENT_TYPE,
      processedAt: null,
    },
    orderBy: { receivedAt: "asc" },
    take: limit,
  });

  const results: Array<{
    journeyId: string;
    conversationId: string;
    status: string;
    outboundSent: false;
    error?: string;
  }> = [];
  for (const event of events) {
    const enrollment = parseEnrollment(event.payload);
    try {
      const result = await processJourneyEnrollment({
        journeyId: enrollment.journeyId,
        conversationId: enrollment.conversationId,
        actorId: input.actorId,
        now: input.now,
      });
      results.push({
        journeyId: enrollment.journeyId,
        conversationId: enrollment.conversationId,
        status: result.enrollment.status,
        outboundSent: false,
      });
    } catch (error) {
      results.push({
        journeyId: enrollment.journeyId,
        conversationId: enrollment.conversationId,
        status: enrollment.status,
        outboundSent: false,
        error: error instanceof Error ? error.message : "Journey processing failed.",
      });
    }
  }
  return {
    inspected: events.length,
    processed: results.length,
    outboundSent: false as const,
    results,
  };
}

