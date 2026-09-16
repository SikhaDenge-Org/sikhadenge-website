import {
  AgentMode,
  ConsentStatus,
  MessageActor,
  Prisma,
  TemplateStatus,
} from "@prisma/client";

import type { MasterclassConfig } from "../agent/masterclass-community-flow";
import { prisma } from "../db/prisma";
import {
  dispatchOutboundMessage,
  queueOutboundMessage,
} from "../outbound/outbound-service";
import { isServiceWindowOpen } from "../outbound/policy";
import {
  submitTemplateToMeta,
  syncTemplatesFromMeta,
} from "../templates/template-service";
import { sha256Hex } from "../meta/signature";
import { enqueueEmailAutomationEvent } from "../../modules/email-automation/automation/event-outbox";

const CONFIG_EVENT_KEY = "masterclass-two-step:config";
const CONFIG_EVENT_TYPE = "masterclass_two_step_config";
const ENROLLMENT_EVENT_TYPE = "masterclass_two_step_enrollment";
const INSTANT_TEMPLATE_NAME = "sikhadenge_masterclass_registration_v1";
const REMINDER_TEMPLATE_NAME = "sikhadenge_masterclass_reminder_v1";
const DEFAULT_COMMUNITY_LINK =
  "https://chat.whatsapp.com/DWeqmllf2x064XjeOP4yRd";
const DEFAULT_DELAY_MINUTES = 135;
const MAX_DUE_BATCH = 250;

export type MasterclassFlowConfig = {
  enabled: boolean;
  classTime: string;
  classDate: string;
  classDay: string;
  communityLink: string;
  delayMinutes: number;
  version: number;
  updatedBy: string | null;
  updatedAt: string;
};

type MasterclassSnapshot = {
  classTime: string;
  classDate: string;
  classDay: string;
  communityLink: string;
  delayMinutes: number;
  configVersion: number;
  instantTemplateId: string;
  reminderTemplateId: string;
};

type EnrollmentStatus =
  | "ENROLLING"
  | "PENDING_REMINDER"
  | "COMPLETED"
  | "SKIPPED"
  | "FAILED";

type EnrollmentPayload = {
  enrollmentId: string;
  registrationKey: string;
  contactId: string;
  conversationId: string;
  source: string;
  status: EnrollmentStatus;
  snapshot: MasterclassSnapshot;
  registeredAt: string;
  followUpDueAt: string;
  instantMessageId: string | null;
  instantQueuedAt: string | null;
  instantDispatchStatus: string | null;
  reminderMessageId: string | null;
  reminderQueuedAt: string | null;
  reminderDispatchStatus: string | null;
  skipReason: string | null;
  lastError: string | null;
  updatedAt: string;
};

type TemplateDefinition = {
  name: string;
  components: Prisma.InputJsonValue;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function asRecord(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function clean(value: unknown, maximum: number): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maximum)
    : "";
}

function integer(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(parsed)));
}

function defaultConfig(): MasterclassFlowConfig {
  return {
    enabled: false,
    classTime: "08:00 PM",
    classDate: "07 August",
    classDay: "Friday",
    communityLink: DEFAULT_COMMUNITY_LINK,
    delayMinutes: DEFAULT_DELAY_MINUTES,
    version: 1,
    updatedBy: null,
    updatedAt: new Date().toISOString(),
  };
}

function parseConfig(value: Prisma.JsonValue): MasterclassFlowConfig | null {
  const record = asRecord(value);
  const classTime = clean(record.classTime, 40);
  const classDate = clean(record.classDate, 80);
  const classDay = clean(record.classDay, 30);
  const communityLink = clean(record.communityLink, 500);
  if (!classTime || !classDate || !classDay || !communityLink) return null;

  return {
    enabled: record.enabled === true,
    classTime,
    classDate,
    classDay,
    communityLink,
    delayMinutes: integer(
      record.delayMinutes,
      DEFAULT_DELAY_MINUTES,
      5,
      1_440,
    ),
    version: integer(record.version, 1, 1, 1_000_000),
    updatedBy: clean(record.updatedBy, 100) || null,
    updatedAt: clean(record.updatedAt, 60) || new Date().toISOString(),
  };
}

function parseSnapshot(value: unknown): MasterclassSnapshot | null {
  const record = asRecord((value ?? null) as Prisma.JsonValue | null);
  const classTime = clean(record.classTime, 40);
  const classDate = clean(record.classDate, 80);
  const classDay = clean(record.classDay, 30);
  const communityLink = clean(record.communityLink, 500);
  const instantTemplateId = clean(record.instantTemplateId, 100);
  const reminderTemplateId = clean(record.reminderTemplateId, 100);
  if (
    !classTime ||
    !classDate ||
    !classDay ||
    !communityLink ||
    !instantTemplateId ||
    !reminderTemplateId
  ) {
    return null;
  }
  return {
    classTime,
    classDate,
    classDay,
    communityLink,
    delayMinutes: integer(
      record.delayMinutes,
      DEFAULT_DELAY_MINUTES,
      5,
      1_440,
    ),
    configVersion: integer(record.configVersion, 1, 1, 1_000_000),
    instantTemplateId,
    reminderTemplateId,
  };
}

function parseEnrollment(value: Prisma.JsonValue): EnrollmentPayload | null {
  const record = asRecord(value);
  const enrollmentId = clean(record.enrollmentId, 100);
  const registrationKey = clean(record.registrationKey, 200);
  const contactId = clean(record.contactId, 100);
  const conversationId = clean(record.conversationId, 100);
  const snapshot = parseSnapshot(record.snapshot);
  const status = clean(record.status, 40).toUpperCase() as EnrollmentStatus;
  const allowed: EnrollmentStatus[] = [
    "ENROLLING",
    "PENDING_REMINDER",
    "COMPLETED",
    "SKIPPED",
    "FAILED",
  ];
  if (
    !enrollmentId ||
    !registrationKey ||
    !contactId ||
    !conversationId ||
    !snapshot
  ) {
    return null;
  }
  return {
    enrollmentId,
    registrationKey,
    contactId,
    conversationId,
    source: clean(record.source, 120) || "WEBSITE_MASTERCLASS",
    status: allowed.includes(status) ? status : "FAILED",
    snapshot,
    registeredAt: clean(record.registeredAt, 60),
    followUpDueAt: clean(record.followUpDueAt, 60),
    instantMessageId: clean(record.instantMessageId, 100) || null,
    instantQueuedAt: clean(record.instantQueuedAt, 60) || null,
    instantDispatchStatus: clean(record.instantDispatchStatus, 80) || null,
    reminderMessageId: clean(record.reminderMessageId, 100) || null,
    reminderQueuedAt: clean(record.reminderQueuedAt, 60) || null,
    reminderDispatchStatus: clean(record.reminderDispatchStatus, 80) || null,
    skipReason: clean(record.skipReason, 300) || null,
    lastError: clean(record.lastError, 500) || null,
    updatedAt: clean(record.updatedAt, 60) || new Date().toISOString(),
  };
}

export function renderMasterclassInstantMessage(
  input: Pick<
    MasterclassFlowConfig,
    "classTime" | "classDate" | "classDay" | "communityLink"
  >,
): string {
  return `Hi Learner 👋\n\nAapka registration *Free AI Expert Masterclass* ke liye *successfully receive ho gaya hai.* 🚀\n\n🔴 *Live Class | ${input.classTime}*\n🗓 *${input.classDate} | ${input.classDay}*\n\n📌 *Masterclass ki joining link aur complete details* aapko hamari *WhatsApp Community* mein share ki jayengi.\n\n👉 Updates miss na karne aur apni seat confirm karne ke liye abhi *WhatsApp Community join karein:*\n\n🟢 ${input.communityLink}\n\n⚠️ *Seats limited hain — abhi community join karein.* ⏳\n\n*Thank You for Registering!*\n*Team SikhaDenge* 🎓`;
}

export function renderMasterclassReminderMessage(
  input: Pick<
    MasterclassFlowConfig,
    "classTime" | "classDate" | "classDay" | "communityLink"
  >,
): string {
  return `Hi Learner 👋\n\n⏰ Just a Quick Reminder\n\n*AI Expert Masterclass* ki joining link aur final class instructions hamari *WhatsApp Community* mein hi share ki jayengi.\n\n🔴 *Live Class | ${input.classTime}*\n🗓 *${input.classDate} | ${input.classDay}*\n\n👉 Agar aapne abhi tak WhatsApp Community join nahi ki hai, to neeche diye gaye link se abhi join karein:\n\n🟢 ${input.communityLink}\n\n✅ Community pehle hi join kar chuke hain?\nPerfect! Aapko kuch aur karne ki zarurat nahi hai. Class ki details community mein mil jayengi.\n\n⚠️ Class start hone se pehle WhatsApp Community check karna na bhoolein.\n\n*See You in the 🔴Live Masterclass!*\n*Team SikhaDenge* 🎓`;
}

function templateDefinitions(): TemplateDefinition[] {
  const example = [
    "08:00 PM",
    "07 August",
    "Friday",
    DEFAULT_COMMUNITY_LINK,
  ];
  return [
    {
      name: INSTANT_TEMPLATE_NAME,
      components: toJson([
        {
          type: "BODY",
          text: renderMasterclassInstantMessage({
            classTime: "{{1}}",
            classDate: "{{2}}",
            classDay: "{{3}}",
            communityLink: "{{4}}",
          }),
          example: { body_text: [example] },
        },
      ]),
    },
    {
      name: REMINDER_TEMPLATE_NAME,
      components: toJson([
        {
          type: "BODY",
          text: renderMasterclassReminderMessage({
            classTime: "{{1}}",
            classDate: "{{2}}",
            classDay: "{{3}}",
            communityLink: "{{4}}",
          }),
          example: { body_text: [example] },
        },
      ]),
    },
  ];
}

function templateComponents(snapshot: MasterclassSnapshot) {
  return [
    {
      type: "body",
      parameters: [
        snapshot.classTime,
        snapshot.classDate,
        snapshot.classDay,
        snapshot.communityLink,
      ].map((text) => ({ type: "text", text })),
    },
  ];
}

async function loadTemplates() {
  const templates = await prisma.whatsAppTemplate.findMany({
    where: {
      name: { in: [INSTANT_TEMPLATE_NAME, REMINDER_TEMPLATE_NAME] },
    },
  });
  return {
    instant:
      templates.find((template) => template.name === INSTANT_TEMPLATE_NAME) ??
      null,
    reminder:
      templates.find((template) => template.name === REMINDER_TEMPLATE_NAME) ??
      null,
  };
}

export async function getMasterclassFlowConfig(): Promise<MasterclassFlowConfig> {
  const existing = await prisma.webhookEvent.findUnique({
    where: { eventKey: CONFIG_EVENT_KEY },
  });
  const parsed = existing ? parseConfig(existing.payload) : null;
  if (parsed) return parsed;

  const config = defaultConfig();
  try {
    await prisma.webhookEvent.create({
      data: {
        eventKey: CONFIG_EVENT_KEY,
        eventType: CONFIG_EVENT_TYPE,
        payload: toJson(config),
        processedAt: new Date(),
        attemptCount: 1,
      },
    });
    return config;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const concurrent = await prisma.webhookEvent.findUnique({
        where: { eventKey: CONFIG_EVENT_KEY },
      });
      const concurrentConfig = concurrent
        ? parseConfig(concurrent.payload)
        : null;
      if (concurrentConfig) return concurrentConfig;
    }
    throw error;
  }
}

export async function ensureMasterclassTemplates(actorId: string) {
  const definitions = templateDefinitions();
  const result = [];

  for (const definition of definitions) {
    const existing = await prisma.whatsAppTemplate.findUnique({
      where: { name: definition.name },
    });
    if (!existing) {
      result.push(
        await prisma.whatsAppTemplate.create({
          data: {
            name: definition.name,
            language: "en_US",
            category: "MARKETING",
            status: TemplateStatus.DRAFT,
            components: definition.components,
          },
        }),
      );
      continue;
    }

    if (
      existing.status === TemplateStatus.DRAFT ||
      existing.status === TemplateStatus.REJECTED
    ) {
      result.push(
        await prisma.whatsAppTemplate.update({
          where: { id: existing.id },
          data: {
            language: "en_US",
            category: "MARKETING",
            components: definition.components,
          },
        }),
      );
    } else {
      result.push(existing);
    }
  }

  await prisma.auditLog.create({
    data: {
      actorId,
      action: "MASTERCLASS_TEMPLATES_PREPARED",
      entityType: "MasterclassTwoStepFlow",
      entityId: CONFIG_EVENT_KEY,
      after: toJson(
        result.map((template) => ({
          name: template.name,
          status: template.status,
        })),
      ),
    },
  });
  return result;
}

export async function submitMasterclassTemplates(actorId: string) {
  const templates = await ensureMasterclassTemplates(actorId);
  const submitted = [];
  for (const template of templates) {
    if (
      template.status === TemplateStatus.DRAFT ||
      template.status === TemplateStatus.REJECTED
    ) {
      submitted.push(
        await submitTemplateToMeta({ templateId: template.id, actorId }),
      );
    } else {
      submitted.push(template);
    }
  }
  return submitted;
}

export async function syncMasterclassTemplates(actorId: string) {
  await syncTemplatesFromMeta(actorId);
  return loadTemplates();
}

export async function saveMasterclassFlowConfig(input: {
  enabled?: unknown;
  classTime?: unknown;
  classDate?: unknown;
  classDay?: unknown;
  communityLink?: unknown;
  delayMinutes?: unknown;
  actorId: string;
}) {
  const current = await getMasterclassFlowConfig();
  const classTime =
    input.classTime === undefined
      ? current.classTime
      : clean(input.classTime, 40);
  const classDate =
    input.classDate === undefined
      ? current.classDate
      : clean(input.classDate, 80);
  const classDay =
    input.classDay === undefined ? current.classDay : clean(input.classDay, 30);
  const communityLink =
    input.communityLink === undefined
      ? current.communityLink
      : clean(input.communityLink, 500);
  const delayMinutes =
    input.delayMinutes === undefined
      ? current.delayMinutes
      : integer(input.delayMinutes, current.delayMinutes, 5, 1_440);
  const enabled =
    input.enabled === undefined ? current.enabled : input.enabled === true;

  if (!classTime || !classDate || !classDay) {
    throw new Error("Class time, date and day are required.");
  }
  if (!/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9_-]+$/u.test(communityLink)) {
    throw new Error("A valid WhatsApp Community invite link is required.");
  }

  if (enabled) {
    const templates = await loadTemplates();
    if (
      templates.instant?.status !== TemplateStatus.APPROVED ||
      templates.reminder?.status !== TemplateStatus.APPROVED
    ) {
      throw new Error(
        "Both masterclass WhatsApp templates must be APPROVED before the flow can be enabled.",
      );
    }
  }

  const updated: MasterclassFlowConfig = {
    enabled,
    classTime,
    classDate,
    classDay,
    communityLink,
    delayMinutes,
    version: current.version + 1,
    updatedBy: input.actorId,
    updatedAt: new Date().toISOString(),
  };

  await prisma.$transaction([
    prisma.webhookEvent.update({
      where: { eventKey: CONFIG_EVENT_KEY },
      data: { payload: toJson(updated), processedAt: new Date() },
    }),
    prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "MASTERCLASS_FLOW_CONFIG_UPDATED",
        entityType: "MasterclassTwoStepFlow",
        entityId: CONFIG_EVENT_KEY,
        before: toJson(current),
        after: toJson(updated),
      },
    }),
  ]);
  return updated;
}

async function queueAndDispatch(input: {
  conversationId: string;
  snapshot: MasterclassSnapshot;
  kind: "instant" | "reminder";
  actorId?: string | null;
  idempotencyKey: string;
}) {
  const conversation = await prisma.whatsAppConversation.findUnique({
    where: { id: input.conversationId },
    select: { serviceWindowExpiresAt: true },
  });
  if (!conversation) throw new Error("Conversation not found.");

  const now = new Date();
  const text =
    input.kind === "instant"
      ? renderMasterclassInstantMessage(input.snapshot)
      : renderMasterclassReminderMessage(input.snapshot);
  const templateId =
    input.kind === "instant"
      ? input.snapshot.instantTemplateId
      : input.snapshot.reminderTemplateId;
  const content = isServiceWindowOpen(conversation.serviceWindowExpiresAt, now)
    ? ({ kind: "text", text } as const)
    : ({
        kind: "template",
        templateId,
        components: templateComponents(input.snapshot),
      } as const);

  const queued = await queueOutboundMessage({
    conversationId: input.conversationId,
    actor: MessageActor.SYSTEM,
    sentById: input.actorId || undefined,
    content,
    idempotencyKey: input.idempotencyKey,
    now,
  });

  const dispatch =
    queued.message?.id && !queued.duplicate
      ? await dispatchOutboundMessage(queued.message.id)
      : null;
  return {
    messageId: queued.message?.id ?? null,
    duplicate: queued.duplicate,
    queued: queued.queued,
    dispatchStatus:
      dispatch?.status ?? queued.message?.status ?? (queued.duplicate ? "DUPLICATE" : null),
    outboundSent: dispatch?.outboundSent ?? false,
  };
}

function enrollmentEventKey(registrationKey: string): string {
  return `masterclass-enrollment:${sha256Hex(registrationKey)}`;
}

async function markEnrollment(
  eventId: string,
  payload: EnrollmentPayload,
  input?: { processed?: boolean; processingError?: string | null },
) {
  await prisma.webhookEvent.update({
    where: { id: eventId },
    data: {
      payload: toJson(payload),
      processedAt: input?.processed ? new Date() : null,
      processingError: input?.processingError ?? null,
      attemptCount: { increment: 1 },
    },
  });
}

export async function enrollMasterclassContact(input: {
  contactId: string;
  registrationKey: string;
  source?: string;
  actorId?: string | null;
}) {
  const config = await getMasterclassFlowConfig();
  if (!config.enabled) {
    throw new Error("Masterclass two-step flow is not enabled.");
  }

  const registrationKey = clean(input.registrationKey, 200);
  if (!registrationKey) throw new Error("Registration idempotency key is required.");

  const [contact, templates] = await Promise.all([
    prisma.whatsAppContact.findUnique({
      where: { id: input.contactId },
      include: {
        conversations: {
          orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
          take: 1,
        },
      },
    }),
    loadTemplates(),
  ]);
  if (!contact) throw new Error("Registered contact was not found.");
  if (
    contact.consentStatus !== ConsentStatus.OPTED_IN ||
    contact.optedOutAt
  ) {
    throw new Error("CONTACT_NOT_OPTED_IN");
  }
  const conversation = contact.conversations[0];
  if (!conversation) throw new Error("Registered contact has no conversation.");
  const source = conversation.source?.trim().toLowerCase();
  if (source === "instagram" || source === "messenger") {
    throw new Error("Masterclass registration flow supports WhatsApp leads only.");
  }
  if (
    templates.instant?.status !== TemplateStatus.APPROVED ||
    templates.reminder?.status !== TemplateStatus.APPROVED
  ) {
    throw new Error("Masterclass WhatsApp templates are not approved.");
  }

  const eventKey = enrollmentEventKey(registrationKey);
  const existing = await prisma.webhookEvent.findUnique({ where: { eventKey } });
  if (existing) {
    const existingPayload = parseEnrollment(existing.payload);
    return {
      duplicate: true,
      enrollment: existingPayload,
    };
  }

  const now = new Date();
  const snapshot: MasterclassSnapshot = {
    classTime: config.classTime,
    classDate: config.classDate,
    classDay: config.classDay,
    communityLink: config.communityLink,
    delayMinutes: config.delayMinutes,
    configVersion: config.version,
    instantTemplateId: templates.instant.id,
    reminderTemplateId: templates.reminder.id,
  };
  const payload: EnrollmentPayload = {
    enrollmentId: sha256Hex(`${registrationKey}:${contact.id}`).slice(0, 32),
    registrationKey,
    contactId: contact.id,
    conversationId: conversation.id,
    source: clean(input.source, 120) || conversation.source || "WEBSITE_MASTERCLASS",
    status: "ENROLLING",
    snapshot,
    registeredAt: now.toISOString(),
    followUpDueAt: new Date(
      now.getTime() + config.delayMinutes * 60 * 1_000,
    ).toISOString(),
    instantMessageId: null,
    instantQueuedAt: null,
    instantDispatchStatus: null,
    reminderMessageId: null,
    reminderQueuedAt: null,
    reminderDispatchStatus: null,
    skipReason: null,
    lastError: null,
    updatedAt: now.toISOString(),
  };

  let event;
  try {
    event = await prisma.webhookEvent.create({
      data: {
        eventKey,
        eventType: ENROLLMENT_EVENT_TYPE,
        payload: toJson(payload),
        attemptCount: 0,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const duplicate = await prisma.webhookEvent.findUnique({ where: { eventKey } });
      return {
        duplicate: true,
        enrollment: duplicate ? parseEnrollment(duplicate.payload) : null,
      };
    }
    throw error;
  }

  try {
    const send = await queueAndDispatch({
      conversationId: conversation.id,
      snapshot,
      kind: "instant",
      actorId: input.actorId,
      idempotencyKey: `masterclass:${payload.enrollmentId}:instant`,
    });
    const updated: EnrollmentPayload = {
      ...payload,
      status: "PENDING_REMINDER",
      instantMessageId: send.messageId,
      instantQueuedAt: new Date().toISOString(),
      instantDispatchStatus: send.dispatchStatus,
      updatedAt: new Date().toISOString(),
    };
    await markEnrollment(event.id, updated);
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId || null,
        action: "MASTERCLASS_LEAD_ENROLLED",
        entityType: "MasterclassEnrollment",
        entityId: updated.enrollmentId,
        after: toJson({
          contactId: contact.id,
          configVersion: snapshot.configVersion,
          followUpDueAt: updated.followUpDueAt,
          instantMessageId: updated.instantMessageId,
        }),
      },
    });
    return { duplicate: false, enrollment: updated, instant: send };
  } catch (error) {
    const detail =
      error instanceof Error ? error.message.slice(0, 500) : "Instant message failed.";
    const failed: EnrollmentPayload = {
      ...payload,
      status: "FAILED",
      lastError: detail,
      updatedAt: new Date().toISOString(),
    };
    await markEnrollment(event.id, failed, {
      processed: true,
      processingError: detail,
    });
    throw error;
  }
}

async function finishSkippedEnrollment(
  eventId: string,
  payload: EnrollmentPayload,
  reason: string,
) {
  const updated: EnrollmentPayload = {
    ...payload,
    status: "SKIPPED",
    skipReason: reason.slice(0, 300),
    updatedAt: new Date().toISOString(),
  };
  await markEnrollment(eventId, updated, { processed: true });
  return updated;
}

export async function dispatchDueMasterclassFollowUps(input?: {
  actorId?: string | null;
  limit?: number;
}) {
  const now = new Date();
  const limit = Math.max(
    1,
    Math.min(MAX_DUE_BATCH, Math.floor(input?.limit ?? 100)),
  );
  const events = await prisma.webhookEvent.findMany({
    where: {
      eventType: ENROLLMENT_EVENT_TYPE,
      processedAt: null,
    },
    orderBy: { receivedAt: "asc" },
    take: limit,
  });

  let due = 0;
  let queued = 0;
  let skipped = 0;
  let failed = 0;
  const results: Array<Record<string, unknown>> = [];

  for (const event of events) {
    const payload = parseEnrollment(event.payload);
    if (!payload || payload.status !== "PENDING_REMINDER") continue;
    const dueAt = new Date(payload.followUpDueAt);
    if (Number.isNaN(dueAt.getTime()) || dueAt.getTime() > now.getTime()) continue;
    due += 1;

    const contact = await prisma.whatsAppContact.findUnique({
      where: { id: payload.contactId },
      select: {
        consentStatus: true,
        optedOutAt: true,
        conversations: {
          where: { id: payload.conversationId },
          take: 1,
          select: { id: true, source: true },
        },
      },
    });
    if (
      !contact ||
      contact.consentStatus !== ConsentStatus.OPTED_IN ||
      contact.optedOutAt
    ) {
      const updated = await finishSkippedEnrollment(
        event.id,
        payload,
        "CONTACT_NOT_OPTED_IN",
      );
      skipped += 1;
      results.push({ enrollmentId: updated.enrollmentId, status: updated.status });
      continue;
    }
    const conversation = contact.conversations[0];
    const source = conversation?.source?.trim().toLowerCase();
    if (!conversation || source === "instagram" || source === "messenger") {
      const updated = await finishSkippedEnrollment(
        event.id,
        payload,
        "WHATSAPP_CONVERSATION_NOT_AVAILABLE",
      );
      skipped += 1;
      results.push({ enrollmentId: updated.enrollmentId, status: updated.status });
      continue;
    }

    try {
      const send = await queueAndDispatch({
        conversationId: payload.conversationId,
        snapshot: payload.snapshot,
        kind: "reminder",
        actorId: input?.actorId,
        idempotencyKey: `masterclass:${payload.enrollmentId}:reminder`,
      });
      const completed: EnrollmentPayload = {
        ...payload,
        status: "COMPLETED",
        reminderMessageId: send.messageId,
        reminderQueuedAt: new Date().toISOString(),
        reminderDispatchStatus: send.dispatchStatus,
        lastError: null,
        updatedAt: new Date().toISOString(),
      };
      await markEnrollment(event.id, completed, { processed: true });
      await prisma.auditLog.create({
        data: {
          actorId: input?.actorId || null,
          action: "MASTERCLASS_REMINDER_QUEUED",
          entityType: "MasterclassEnrollment",
          entityId: payload.enrollmentId,
          after: toJson({
            contactId: payload.contactId,
            reminderMessageId: completed.reminderMessageId,
            dispatchStatus: completed.reminderDispatchStatus,
          }),
        },
      });
      queued += 1;
      results.push({
        enrollmentId: payload.enrollmentId,
        status: completed.status,
        dispatchStatus: completed.reminderDispatchStatus,
      });
    } catch (error) {
      const detail =
        error instanceof Error
          ? error.message.slice(0, 500)
          : "Reminder queue failed.";
      const terminal =
        detail.includes("OPTED_OUT") ||
        detail.includes("NOT_OPTED_IN") ||
        detail.includes("CONVERSATION_NOT_SENDABLE") ||
        detail.includes("CONVERSATION_PAUSED");
      if (terminal) {
        await finishSkippedEnrollment(event.id, payload, detail);
        skipped += 1;
      } else {
        const retryable: EnrollmentPayload = {
          ...payload,
          lastError: detail,
          updatedAt: new Date().toISOString(),
        };
        await markEnrollment(event.id, retryable, {
          processingError: detail,
        });
        failed += 1;
      }
      results.push({
        enrollmentId: payload.enrollmentId,
        status: terminal ? "SKIPPED" : "RETRY_PENDING",
        error: detail,
      });
    }
  }

  return {
    inspected: events.length,
    due,
    queued,
    skipped,
    failed,
    results,
  };
}

export async function getMasterclassFlowOverview() {
  const [config, templates, enrollmentEvents] = await Promise.all([
    getMasterclassFlowConfig(),
    loadTemplates(),
    prisma.webhookEvent.findMany({
      where: { eventType: ENROLLMENT_EVENT_TYPE },
      orderBy: { receivedAt: "desc" },
      take: 1_000,
      select: { payload: true, processedAt: true },
    }),
  ]);
  const enrollments = enrollmentEvents
    .map((event) => parseEnrollment(event.payload))
    .filter((value): value is EnrollmentPayload => Boolean(value));
  const pending = enrollments.filter(
    (enrollment) => enrollment.status === "PENDING_REMINDER",
  );
  const nextDue = pending
    .map((enrollment) => enrollment.followUpDueAt)
    .filter(Boolean)
    .sort()[0] ?? null;

  return {
    config,
    templates: {
      instant: templates.instant
        ? {
            id: templates.instant.id,
            name: templates.instant.name,
            status: templates.instant.status,
            category: templates.instant.category,
            language: templates.instant.language,
          }
        : null,
      reminder: templates.reminder
        ? {
            id: templates.reminder.id,
            name: templates.reminder.name,
            status: templates.reminder.status,
            category: templates.reminder.category,
            language: templates.reminder.language,
          }
        : null,
    },
    metrics: {
      totalEnrollments: enrollments.length,
      pendingReminders: pending.length,
      completed: enrollments.filter((item) => item.status === "COMPLETED").length,
      skipped: enrollments.filter((item) => item.status === "SKIPPED").length,
      failed: enrollments.filter((item) => item.status === "FAILED").length,
      nextDue,
    },
    previews: {
      instant: renderMasterclassInstantMessage(config),
      reminder: renderMasterclassReminderMessage(config),
    },
    runtime: {
      registrationWebhookConfigured: Boolean(
        process.env.MASTERCLASS_REGISTRATION_WEBHOOK_SECRET?.trim(),
      ),
      workerIntervalSeconds: 60,
      outboundMode:
        process.env.WHATSAPP_OUTBOUND_MODE?.trim().toLowerCase() || "disabled",
    },
    generatedAt: new Date().toISOString(),
  };
}

export async function getMasterclassAgentConfig(): Promise<MasterclassConfig> {
  try {
    const config = await getMasterclassFlowConfig();
    return {
      name: "Free AI Expert Masterclass",
      dateLabel: `${config.classDay}, ${config.classDate}`,
      timeLabel: config.classTime,
      communityUrl: config.communityLink,
    };
  } catch {
    const fallback = defaultConfig();
    return {
      name: "Free AI Expert Masterclass",
      dateLabel: `${fallback.classDay}, ${fallback.classDate}`,
      timeLabel: fallback.classTime,
      communityUrl: fallback.communityLink,
    };
  }
}

export async function getMasterclassAgentConfigForConversation(
  conversationId: string,
): Promise<MasterclassConfig | null> {
  const normalizedConversationId = clean(conversationId, 100);
  if (!normalizedConversationId) return null;

  const events = await prisma.webhookEvent.findMany({
    where: {
      eventType: ENROLLMENT_EVENT_TYPE,
      payload: {
        path: ["conversationId"],
        equals: normalizedConversationId,
      },
    },
    orderBy: { receivedAt: "desc" },
    take: 20,
    select: { payload: true },
  });

  const enrollment = events
    .map((event) => parseEnrollment(event.payload))
    .find(
      (item) =>
        Boolean(item?.instantMessageId) &&
        (item?.status === "PENDING_REMINDER" ||
          item?.status === "COMPLETED"),
    );

  if (!enrollment) return null;

  return {
    name: "Free AI Expert Masterclass",
    dateLabel:
      `${enrollment.snapshot.classDay}, ` +
      enrollment.snapshot.classDate,
    timeLabel: enrollment.snapshot.classTime,
    communityUrl: enrollment.snapshot.communityLink,
  };
}

function normalizePhone(value: unknown): string {
  const digits = clean(value, 40).replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) {
    throw new Error("Phone must contain 8-15 digits including country code.");
  }
  return `+${digits}`;
}

export async function registerMasterclassLead(input: {
  registrationId: unknown;
  name: unknown;
  phone: unknown;
  email?: unknown;
  city?: unknown;
  source?: unknown;
  consent?: unknown;
}) {
  const registrationId = clean(input.registrationId, 200);
  if (!registrationId) throw new Error("registrationId is required.");
  if (input.consent !== true) {
    throw new Error("Explicit WhatsApp messaging consent is required.");
  }
  const name = clean(input.name, 120) || "Learner";
  const phone = normalizePhone(input.phone);
  const waId = phone.replace(/\D/g, "");
  const email = clean(input.email, 254).toLowerCase() || null;
  const city = clean(input.city, 120) || null;
  const source = clean(input.source, 120) || "WEBSITE_MASTERCLASS";

  const leadRecord = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.whatsAppContact.findFirst({
      where: { OR: [{ phone }, { waId }] },
      include: {
        lead: true,
        conversations: {
          orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
          take: 1,
        },
      },
    });
    if (existing?.consentStatus === ConsentStatus.OPTED_OUT || existing?.optedOutAt) {
      throw new Error("CONTACT_OPTED_OUT");
    }

    const contact = existing
      ? await transaction.whatsAppContact.update({
          where: { id: existing.id },
          data: {
            displayName: name,
            profileName: existing.profileName || name,
            email: email || existing.email,
            city: city || existing.city,
            consentStatus: ConsentStatus.OPTED_IN,
            marketingOptInAt: existing.marketingOptInAt || new Date(),
            marketingOptInSource: source,
            optedOutAt: null,
          },
        })
      : await transaction.whatsAppContact.create({
          data: {
            waId,
            phone,
            displayName: name,
            profileName: name,
            email,
            city,
            consentStatus: ConsentStatus.OPTED_IN,
            marketingOptInAt: new Date(),
            marketingOptInSource: source,
          },
        });

    let conversation = existing?.lead
      ? existing.conversations.find(
          (item) => item.id === existing.lead?.conversationId,
        ) ?? null
      : existing?.conversations[0] ?? null;
    if (!conversation) {
      conversation = await transaction.whatsAppConversation.create({
        data: {
          contactId: contact.id,
          source,
          agentMode: AgentMode.AI,
          campaign: "FREE_AI_EXPERT_MASTERCLASS",
        },
      });
    } else {
      conversation = await transaction.whatsAppConversation.update({
        where: { id: conversation.id },
        data: {
          source: conversation.source || source,
          campaign: "FREE_AI_EXPERT_MASTERCLASS",
          ...(conversation.agentMode === AgentMode.PAUSED &&
          !conversation.humanTakeoverAt
            ? { agentMode: AgentMode.AI }
            : {}),
        },
      });
    }

    const lead = await transaction.lead.upsert({
      where: { contactId: contact.id },
      create: {
        contactId: contact.id,
        conversationId: conversation.id,
        interestedCourse: "Free AI Expert Masterclass",
      },
      update: {
        interestedCourse: "Free AI Expert Masterclass",
      },
    });

    const emailWorkspace = await transaction.engageWorkspace.findUnique({
      where: { slug: "sikhadenge-default" },
      select: { id: true, isActive: true },
    });
    if (emailWorkspace?.isActive) {
      await enqueueEmailAutomationEvent(transaction, {
        workspaceId: emailWorkspace.id,
        sourceEventId: `masterclass-registration:${registrationId}`,
        trigger: "FORM_SUBMITTED",
        relatedTriggers: existing ? [] : ["NEW_LEAD"],
        contactId: contact.id,
        leadId: lead.id,
        payload: { registrationId, source, formKind: "MASTERCLASS_REGISTRATION", name, email, city },
      });
    }
    return { contactId: contact.id, conversationId: conversation.id, leadId: lead.id };
  });

  const enrolled = await enrollMasterclassContact({
    contactId: leadRecord.contactId,
    registrationKey: `website:${registrationId}`,
    source,
  });
  return {
    registrationId,
    ...leadRecord,
    enrolled,
  };
}

export const MASTERCLASS_TEMPLATE_NAMES = {
  instant: INSTANT_TEMPLATE_NAME,
  reminder: REMINDER_TEMPLATE_NAME,
} as const;
