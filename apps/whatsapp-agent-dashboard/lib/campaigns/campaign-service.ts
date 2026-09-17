import {
  ConsentStatus,
  LeadStage,
  LeadTemperature,
  MessageActor,
  MessageDirection,
  MessageStatus,
  MessageType,
  Prisma,
  TemplateStatus,
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import { prisma } from "../db/prisma";
import { getOutboundMode } from "../meta/outbound-client";
import { queueOutboundMessage } from "../outbound/outbound-service";
import {
  type CampaignAudienceFilters,
  parseCampaignFilters,
  previewCampaignAudience,
} from "./targeting-service";

const EVENT_TYPE = "campaign_plan";
const MAX_CAMPAIGN_BATCH = 1_000;
const MAX_HISTORY = 100;

export type CampaignLifecycleStatus =
  | "READY"
  | "SCHEDULED"
  | "PAUSED"
  | "QUEUING"
  | "COMPLETED"
  | "CANCELLED"
  | "FAILED";

export type CampaignPlanInput = {
  name: unknown;
  templateId: unknown;
  filters: unknown;
  variables?: unknown;
  scheduledAt?: unknown;
  batchSize?: unknown;
  sendRatePerMinute?: unknown;
  frequencyCapDays?: unknown;
  actorId: string;
};

type CampaignPlanPayload = {
  campaignId: string;
  name: string;
  templateId: string;
  templateName: string;
  templateLanguage: string;
  filters: CampaignAudienceFilters;
  variables: string[];
  status: CampaignLifecycleStatus;
  scheduledAt: string | null;
  batchSize: number;
  sendRatePerMinute: number;
  frequencyCapDays: number;
  audienceTotal: number;
  processedContactIds: string[];
  messageIds: string[];
  queued: number;
  skipped: number;
  failed: number;
  batchesCompleted: number;
  lastError: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
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

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(parsed)));
}

function normalizeVariables(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map((item) => clean(item, 1_000));
}

function normalizeSchedule(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error("Scheduled date is invalid.");
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("Scheduled date is invalid.");
  const maximum = Date.now() + 180 * 24 * 60 * 60 * 1_000;
  if (parsed.getTime() > maximum) {
    throw new Error("Campaign cannot be scheduled more than 180 days ahead.");
  }
  return parsed;
}

function parsePayload(value: Prisma.JsonValue): CampaignPlanPayload | null {
  const record = asRecord(value);
  const campaignId = clean(record.campaignId, 80);
  const name = clean(record.name, 120);
  const templateId = clean(record.templateId, 100);
  if (!campaignId || !name || !templateId) return null;

  const status = clean(record.status, 30).toUpperCase() as CampaignLifecycleStatus;
  const allowedStatuses: CampaignLifecycleStatus[] = [
    "READY",
    "SCHEDULED",
    "PAUSED",
    "QUEUING",
    "COMPLETED",
    "CANCELLED",
    "FAILED",
  ];

  return {
    campaignId,
    name,
    templateId,
    templateName: clean(record.templateName, 512),
    templateLanguage: clean(record.templateLanguage, 30),
    filters: parseCampaignFilters(record.filters),
    variables: normalizeVariables(record.variables),
    status: allowedStatuses.includes(status) ? status : "READY",
    scheduledAt: typeof record.scheduledAt === "string" ? record.scheduledAt : null,
    batchSize: boundedInteger(record.batchSize, 250, 1, MAX_CAMPAIGN_BATCH),
    sendRatePerMinute: boundedInteger(record.sendRatePerMinute, 60, 1, 500),
    frequencyCapDays: boundedInteger(record.frequencyCapDays, 0, 0, 90),
    audienceTotal: boundedInteger(record.audienceTotal, 0, 0, 1_000_000),
    processedContactIds: Array.isArray(record.processedContactIds)
      ? record.processedContactIds.filter((item): item is string => typeof item === "string").slice(0, 5_000)
      : [],
    messageIds: Array.isArray(record.messageIds)
      ? record.messageIds.filter((item): item is string => typeof item === "string").slice(0, 5_000)
      : [],
    queued: boundedInteger(record.queued, 0, 0, 1_000_000),
    skipped: boundedInteger(record.skipped, 0, 0, 1_000_000),
    failed: boundedInteger(record.failed, 0, 0, 1_000_000),
    batchesCompleted: boundedInteger(record.batchesCompleted, 0, 0, 100_000),
    lastError: typeof record.lastError === "string" ? record.lastError.slice(0, 500) : null,
    createdBy: clean(record.createdBy, 100),
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
  };
}

function audienceWhere(filters: CampaignAudienceFilters): Prisma.WhatsAppContactWhereInput {
  const lead: Prisma.LeadWhereInput = {};
  const conversation: Prisma.WhatsAppConversationWhereInput = {};

  if (filters.course) lead.interestedCourse = { contains: filters.course, mode: "insensitive" };
  if (filters.stage) lead.stage = filters.stage;
  if (filters.temperature) lead.temperature = filters.temperature;
  if (filters.assignedToId) lead.assignedToId = filters.assignedToId;

  switch (filters.preset) {
    case "enrolled":
      lead.stage = LeadStage.ENROLLED;
      break;
    case "hot_leads":
      lead.temperature = LeadTemperature.HOT;
      break;
    case "payment_pending":
      lead.stage = LeadStage.PAYMENT_PENDING;
      break;
    case "demo_booked":
      lead.stage = LeadStage.DEMO_BOOKED;
      break;
    case "nurture":
      lead.stage = LeadStage.NURTURE;
      break;
    case "follow_up_due":
      lead.nextFollowUpAt = { lte: new Date() };
      break;
    default:
      break;
  }

  if (filters.tag) {
    conversation.tags = {
      some: { tag: { name: { equals: filters.tag, mode: "insensitive" } } },
    };
  }

  const where: Prisma.WhatsAppContactWhereInput = {
    consentStatus: ConsentStatus.OPTED_IN,
    optedOutAt: null,
    conversations: { some: conversation },
  };
  if (filters.city) where.city = { equals: filters.city, mode: "insensitive" };
  if (filters.language) where.language = { equals: filters.language, mode: "insensitive" };
  if (Object.keys(lead).length > 0) where.lead = { is: lead };
  return where;
}

function templateComponents(variables: string[]) {
  return variables.length > 0
    ? [
        {
          type: "body",
          parameters: variables.map((text) => ({ type: "text", text })),
        },
      ]
    : [];
}

function templateBody(components: Prisma.JsonValue): string {
  if (!Array.isArray(components)) return "";
  const body = components.find((component) => {
    const record = asRecord(component as Prisma.JsonValue);
    return clean(record.type, 20).toUpperCase() === "BODY";
  });
  return body ? clean(asRecord(body as Prisma.JsonValue).text, 4_096) : "";
}

function renderTemplate(text: string, variables: string[]): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_match, number: string) => {
    const index = Number(number) - 1;
    return variables[index] || `{{${number}}}`;
  });
}

async function findCampaignEvent(campaignId: string) {
  const event = await prisma.webhookEvent.findUnique({
    where: { eventKey: `campaign-plan:${campaignId}` },
  });
  if (!event) throw new Error("Campaign plan not found.");
  const payload = parsePayload(event.payload);
  if (!payload) throw new Error("Campaign plan payload is invalid.");
  return { event, payload };
}

export async function createCampaignPlan(input: CampaignPlanInput) {
  const name = clean(input.name, 120);
  const templateId = clean(input.templateId, 100);
  if (name.length < 3) throw new Error("Campaign name must contain at least 3 characters.");
  if (!templateId) throw new Error("An approved WhatsApp template is required.");

  const filters = parseCampaignFilters(input.filters);
  const variables = normalizeVariables(input.variables);
  const scheduledAt = normalizeSchedule(input.scheduledAt);
  const batchSize = boundedInteger(input.batchSize, 250, 1, MAX_CAMPAIGN_BATCH);
  const sendRatePerMinute = boundedInteger(input.sendRatePerMinute, 60, 1, 500);
  const frequencyCapDays = boundedInteger(input.frequencyCapDays, 0, 0, 90);

  const [template, preview] = await Promise.all([
    prisma.whatsAppTemplate.findUnique({
      where: { id: templateId },
      select: { id: true, name: true, language: true, status: true, components: true },
    }),
    previewCampaignAudience(filters, 1),
  ]);
  if (!template || template.status !== TemplateStatus.APPROVED) {
    throw new Error("Selected WhatsApp template is not approved.");
  }
  if (preview.total === 0) throw new Error("No opted-in recipients match this audience.");
  if (preview.total > MAX_CAMPAIGN_BATCH) {
    throw new Error(`Audience has ${preview.total} recipients. Narrow it to ${MAX_CAMPAIGN_BATCH} or fewer.`);
  }

  const body = templateBody(template.components);
  const highestVariable = Array.from(body.matchAll(/\{\{(\d+)\}\}/g)).reduce(
    (maximum, match) => Math.max(maximum, Number(match[1])),
    0,
  );
  if (variables.length < highestVariable || variables.slice(0, highestVariable).some((value) => !value)) {
    throw new Error(`Complete all ${highestVariable} template variable values.`);
  }

  const now = new Date();
  const campaignId = randomUUID();
  const payload: CampaignPlanPayload = {
    campaignId,
    name,
    templateId: template.id,
    templateName: template.name,
    templateLanguage: template.language,
    filters,
    variables: variables.slice(0, highestVariable),
    status: scheduledAt && scheduledAt.getTime() > now.getTime() ? "SCHEDULED" : "READY",
    scheduledAt: scheduledAt?.toISOString() ?? null,
    batchSize,
    sendRatePerMinute,
    frequencyCapDays,
    audienceTotal: preview.total,
    processedContactIds: [],
    messageIds: [],
    queued: 0,
    skipped: 0,
    failed: 0,
    batchesCompleted: 0,
    lastError: null,
    createdBy: input.actorId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  await prisma.$transaction([
    prisma.webhookEvent.create({
      data: {
        eventKey: `campaign-plan:${campaignId}`,
        eventType: EVENT_TYPE,
        payload: toJson(payload),
        attemptCount: 0,
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "CAMPAIGN_PLAN_CREATED",
        entityType: "CampaignPlan",
        entityId: campaignId,
        after: toJson({ name, templateId, audienceTotal: preview.total, status: payload.status }),
      },
    }),
  ]);

  return { ...payload, outboundSent: false, mode: getOutboundMode() };
}

export async function validateCampaignTest(input: {
  templateId: unknown;
  filters: unknown;
  variables?: unknown;
}) {
  const templateId = clean(input.templateId, 100);
  const filters = parseCampaignFilters(input.filters);
  const variables = normalizeVariables(input.variables);
  const [template, preview] = await Promise.all([
    prisma.whatsAppTemplate.findUnique({
      where: { id: templateId },
      select: { name: true, language: true, status: true, components: true },
    }),
    previewCampaignAudience(filters, 1),
  ]);
  if (!template || template.status !== TemplateStatus.APPROVED) {
    throw new Error("Selected WhatsApp template is not approved.");
  }
  const recipient = preview.recipients[0];
  if (!recipient) throw new Error("No eligible test recipient matches this audience.");
  return {
    valid: true,
    outboundSent: false,
    template: { name: template.name, language: template.language },
    recipient,
    renderedBody: renderTemplate(templateBody(template.components), variables),
  };
}

export async function listCampaignPlans(limit = MAX_HISTORY) {
  const events = await prisma.webhookEvent.findMany({
    where: { eventType: EVENT_TYPE },
    orderBy: { receivedAt: "desc" },
    take: Math.max(1, Math.min(MAX_HISTORY, Math.floor(limit))),
  });
  const parsed = events
    .map((event) => ({ event, payload: parsePayload(event.payload) }))
    .filter((item): item is { event: (typeof events)[number]; payload: CampaignPlanPayload } => Boolean(item.payload));
  const messageIds = Array.from(new Set(parsed.flatMap((item) => item.payload.messageIds)));
  const messages = messageIds.length
    ? await prisma.whatsAppMessage.findMany({
        where: { id: { in: messageIds } },
        select: { id: true, status: true },
      })
    : [];
  const statusById = new Map(messages.map((message) => [message.id, message.status]));

  return parsed.map(({ event, payload }) => {
    const statuses = payload.messageIds.map((id) => statusById.get(id)).filter(Boolean) as MessageStatus[];
    const count = (status: MessageStatus) => statuses.filter((value) => value === status).length;
    return {
      ...payload,
      eventReceivedAt: event.receivedAt.toISOString(),
      delivery: {
        queued: count(MessageStatus.QUEUED),
        sent: count(MessageStatus.SENT),
        delivered: count(MessageStatus.DELIVERED),
        read: count(MessageStatus.READ),
        failed: count(MessageStatus.FAILED),
      },
    };
  });
}

export async function controlCampaignPlan(input: {
  campaignId: string;
  action: unknown;
  actorId: string;
}) {
  const action = clean(input.action, 30).toLowerCase();
  if (!["pause", "resume", "cancel"].includes(action)) {
    throw new Error("Action must be pause, resume, or cancel.");
  }
  const { event, payload } = await findCampaignEvent(input.campaignId);
  if (payload.status === "COMPLETED" || payload.status === "CANCELLED") {
    throw new Error(`Campaign is already ${payload.status.toLowerCase()}.`);
  }

  let status: CampaignLifecycleStatus;
  if (action === "pause") status = "PAUSED";
  else if (action === "cancel") status = "CANCELLED";
  else {
    const schedule = payload.scheduledAt ? new Date(payload.scheduledAt) : null;
    status = schedule && schedule.getTime() > Date.now() ? "SCHEDULED" : "READY";
  }
  const updated = { ...payload, status, updatedAt: new Date().toISOString(), lastError: null };

  await prisma.$transaction([
    prisma.webhookEvent.update({
      where: { id: event.id },
      data: { payload: toJson(updated) },
    }),
    prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: `CAMPAIGN_${action.toUpperCase()}`,
        entityType: "CampaignPlan",
        entityId: payload.campaignId,
        before: toJson({ status: payload.status }),
        after: toJson({ status }),
      },
    }),
  ]);
  return updated;
}

export async function dispatchCampaignPlan(campaignId: string, actorId: string) {
  if (process.env.WHATSAPP_CAMPAIGNS_ENABLED !== "true") {
    throw new Error("Campaign dispatch is locked until final Meta cutover.");
  }
  if (getOutboundMode() !== "live") {
    throw new Error("WhatsApp outbound mode must be live before campaign dispatch.");
  }

  const { event, payload } = await findCampaignEvent(campaignId);
  if (["PAUSED", "CANCELLED", "COMPLETED"].includes(payload.status)) {
    throw new Error(`Campaign is ${payload.status.toLowerCase()} and cannot be dispatched.`);
  }
  if (payload.scheduledAt && new Date(payload.scheduledAt).getTime() > Date.now()) {
    throw new Error("Campaign schedule has not been reached.");
  }

  const processing = { ...payload, status: "QUEUING" as const, updatedAt: new Date().toISOString() };
  await prisma.webhookEvent.update({ where: { id: event.id }, data: { payload: toJson(processing) } });

  try {
    const cutoff = payload.frequencyCapDays
      ? new Date(Date.now() - payload.frequencyCapDays * 24 * 60 * 60 * 1_000)
      : null;
    const recipients = await prisma.whatsAppContact.findMany({
      where: {
        ...audienceWhere(payload.filters),
        id: { notIn: payload.processedContactIds },
      },
      orderBy: { updatedAt: "desc" },
      take: payload.batchSize,
      select: {
        id: true,
        conversations: {
          orderBy: { lastMessageAt: "desc" },
          take: 1,
          select: {
            id: true,
            messages: cutoff
              ? {
                  where: {
                    direction: MessageDirection.OUTBOUND,
                    type: MessageType.TEMPLATE,
                    messageTimestamp: { gte: cutoff },
                  },
                  take: 1,
                  select: { id: true },
                }
              : false,
          },
        },
      },
    });

    let queued = 0;
    let skipped = 0;
    let failed = 0;
    const processedContactIds = [...payload.processedContactIds];
    const messageIds = [...payload.messageIds];

    for (const recipient of recipients) {
      processedContactIds.push(recipient.id);
      const conversation = recipient.conversations[0];
      if (!conversation) {
        skipped += 1;
        continue;
      }
      const recentMessages = "messages" in conversation && Array.isArray(conversation.messages)
        ? conversation.messages
        : [];
      if (cutoff && recentMessages.length > 0) {
        skipped += 1;
        continue;
      }
      try {
        const result = await queueOutboundMessage({
          conversationId: conversation.id,
          actor: MessageActor.COUNSELOR,
          sentById: actorId,
          content: {
            kind: "template",
            templateId: payload.templateId,
            components: templateComponents(payload.variables),
          },
          idempotencyKey: `campaign:${payload.campaignId}:${recipient.id}`,
        });
        if (result.queued || result.duplicate) queued += 1;
        if (result.message?.id) messageIds.push(result.message.id);
      } catch {
        failed += 1;
      }
    }

    const totalProcessed = processedContactIds.length;
    const completed = totalProcessed >= payload.audienceTotal || recipients.length === 0;
    const updated: CampaignPlanPayload = {
      ...payload,
      status: completed ? "COMPLETED" : "READY",
      processedContactIds,
      messageIds,
      queued: payload.queued + queued,
      skipped: payload.skipped + skipped,
      failed: payload.failed + failed,
      batchesCompleted: payload.batchesCompleted + 1,
      lastError: null,
      updatedAt: new Date().toISOString(),
    };

    await prisma.$transaction([
      prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          payload: toJson(updated),
          processedAt: completed ? new Date() : null,
          attemptCount: { increment: 1 },
        },
      }),
      prisma.auditLog.create({
        data: {
          actorId,
          action: "CAMPAIGN_BATCH_QUEUED",
          entityType: "CampaignPlan",
          entityId: payload.campaignId,
          after: toJson({ queued, skipped, failed, completed, batch: updated.batchesCompleted }),
        },
      }),
    ]);
    return { ...updated, batchQueued: queued, batchSkipped: skipped, batchFailed: failed };
  } catch (error) {
    const failedPayload: CampaignPlanPayload = {
      ...payload,
      status: "FAILED",
      lastError: error instanceof Error ? error.message.slice(0, 500) : "Campaign dispatch failed.",
      updatedAt: new Date().toISOString(),
    };
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { payload: toJson(failedPayload), attemptCount: { increment: 1 } },
    });
    throw error;
  }
}

export async function dispatchDueCampaigns(actorId: string) {
  const plans = await listCampaignPlans(100);
  const due = plans
    .filter((plan) => {
      if (plan.status === "READY") return true;
      return plan.status === "SCHEDULED" && Boolean(plan.scheduledAt) && new Date(plan.scheduledAt as string).getTime() <= Date.now();
    })
    .slice(0, 10);
  const results = [];
  for (const plan of due) {
    try {
      results.push({ campaignId: plan.campaignId, ok: true, result: await dispatchCampaignPlan(plan.campaignId, actorId) });
    } catch (error) {
      results.push({
        campaignId: plan.campaignId,
        ok: false,
        error: error instanceof Error ? error.message : "Dispatch failed.",
      });
    }
  }
  return { checked: plans.length, due: due.length, results };
}
