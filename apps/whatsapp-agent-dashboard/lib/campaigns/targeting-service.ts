import {
  ConsentStatus,
  LeadStage,
  LeadTemperature,
  MessageActor,
  Prisma,
  TemplateStatus,
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import { prisma } from "../db/prisma";
import { getOutboundMode } from "../meta/outbound-client";
import { queueOutboundMessage } from "../outbound/outbound-service";

const MAX_PREVIEW_ROWS = 50;
const MAX_CAMPAIGN_BATCH = 1_000;

export type CampaignPreset =
  | "all_opted_in"
  | "enrolled"
  | "hot_leads"
  | "payment_pending"
  | "demo_booked"
  | "nurture"
  | "follow_up_due";

export type CampaignAudienceFilters = {
  preset: CampaignPreset;
  city: string;
  language: string;
  course: string;
  stage: LeadStage | "";
  temperature: LeadTemperature | "";
  tag: string;
  assignedToId: string;
};

export type TargetedCampaignInput = {
  name: string;
  templateId: string;
  filters: CampaignAudienceFilters;
  components?: unknown[];
  actorId: string;
};

function compact(value: unknown, maximum: number): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maximum)
    : "";
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | "" {
  const normalised = compact(value, 80).toUpperCase();
  return allowed.includes(normalised as T) ? (normalised as T) : "";
}

export function parseCampaignFilters(value: unknown): CampaignAudienceFilters {
  const payload =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const presets: CampaignPreset[] = [
    "all_opted_in",
    "enrolled",
    "hot_leads",
    "payment_pending",
    "demo_booked",
    "nurture",
    "follow_up_due",
  ];
  const requestedPreset = compact(payload.preset, 40).toLowerCase();

  return {
    preset: presets.includes(requestedPreset as CampaignPreset)
      ? (requestedPreset as CampaignPreset)
      : "all_opted_in",
    city: compact(payload.city, 100),
    language: compact(payload.language, 50),
    course: compact(payload.course, 160),
    stage: enumValue(payload.stage, Object.values(LeadStage)),
    temperature: enumValue(payload.temperature, Object.values(LeadTemperature)),
    tag: compact(payload.tag, 80),
    assignedToId: compact(payload.assignedToId, 80),
  };
}

function buildAudienceWhere(
  filters: CampaignAudienceFilters,
): Prisma.WhatsAppContactWhereInput {
  const lead: Prisma.LeadWhereInput = {};
  const conversation: Prisma.WhatsAppConversationWhereInput = {};

  if (filters.course) {
    lead.interestedCourse = { contains: filters.course, mode: "insensitive" };
  }
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
      some: {
        tag: { name: { equals: filters.tag, mode: "insensitive" } },
      },
    };
  }

  const where: Prisma.WhatsAppContactWhereInput = {
    consentStatus: ConsentStatus.OPTED_IN,
    optedOutAt: null,
    conversations: { some: conversation },
  };

  if (filters.city) {
    where.city = { equals: filters.city, mode: "insensitive" };
  }
  if (filters.language) {
    where.language = { equals: filters.language, mode: "insensitive" };
  }
  if (Object.keys(lead).length > 0) {
    where.lead = { is: lead };
  }

  return where;
}

const recipientSelect = {
  id: true,
  displayName: true,
  profileName: true,
  phone: true,
  city: true,
  language: true,
  consentStatus: true,
  lead: {
    select: {
      stage: true,
      temperature: true,
      interestedCourse: true,
      assignedTo: { select: { id: true, name: true } },
    },
  },
  conversations: {
    orderBy: { lastMessageAt: "desc" as const },
    take: 1,
    select: {
      id: true,
      status: true,
      agentMode: true,
      lastMessageAt: true,
      serviceWindowExpiresAt: true,
    },
  },
} satisfies Prisma.WhatsAppContactSelect;

export async function previewCampaignAudience(
  filters: CampaignAudienceFilters,
  requestedLimit = 25,
) {
  const where = buildAudienceWhere(filters);
  const limit = Math.max(1, Math.min(MAX_PREVIEW_ROWS, Math.floor(requestedLimit)));

  const [total, recipients] = await prisma.$transaction([
    prisma.whatsAppContact.count({ where }),
    prisma.whatsAppContact.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: recipientSelect,
    }),
  ]);

  return {
    total,
    previewLimit: limit,
    launchBatchLimit: MAX_CAMPAIGN_BATCH,
    recipients: recipients.map((recipient) => ({
      id: recipient.id,
      name:
        recipient.displayName || recipient.profileName || recipient.phone,
      phone: recipient.phone,
      city: recipient.city,
      language: recipient.language,
      stage: recipient.lead?.stage ?? null,
      temperature: recipient.lead?.temperature ?? null,
      course: recipient.lead?.interestedCourse ?? null,
      assignedTo: recipient.lead?.assignedTo?.name ?? null,
      conversationId: recipient.conversations[0]?.id ?? null,
      serviceWindowExpiresAt:
        recipient.conversations[0]?.serviceWindowExpiresAt ?? null,
    })),
  };
}

function uniqueValues(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]),
  ).sort((a, b) => a.localeCompare(b));
}

export async function getCampaignTargetingOptions() {
  const [contacts, templates, tags, counselors] = await prisma.$transaction([
    prisma.whatsAppContact.findMany({
      where: {
        consentStatus: ConsentStatus.OPTED_IN,
        optedOutAt: null,
      },
      take: 5_000,
      select: {
        city: true,
        language: true,
        lead: { select: { interestedCourse: true } },
      },
    }),
    prisma.whatsAppTemplate.findMany({
      where: { status: TemplateStatus.APPROVED },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        language: true,
        category: true,
        components: true,
      },
    }),
    prisma.conversationTag.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.dashboardUser.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
  ]);

  return {
    mode: getOutboundMode(),
    campaignsEnabled: process.env.WHATSAPP_CAMPAIGNS_ENABLED === "true",
    batchLimit: MAX_CAMPAIGN_BATCH,
    cities: uniqueValues(contacts.map((contact) => contact.city)),
    languages: uniqueValues(contacts.map((contact) => contact.language)),
    courses: uniqueValues(
      contacts.map((contact) => contact.lead?.interestedCourse),
    ),
    tags,
    counselors,
    templates,
    stages: Object.values(LeadStage),
    temperatures: Object.values(LeadTemperature),
  };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function launchTargetedCampaign(input: TargetedCampaignInput) {
  const name = compact(input.name, 120);
  if (name.length < 3) throw new Error("Campaign name is required.");
  if (!input.templateId) throw new Error("Approved template is required.");
  if (process.env.WHATSAPP_CAMPAIGNS_ENABLED !== "true") {
    throw new Error("Targeted campaign sending is locked until final Meta cutover.");
  }
  if (getOutboundMode() !== "live") {
    throw new Error("WhatsApp outbound mode must be live before launching a campaign.");
  }

  const template = await prisma.whatsAppTemplate.findUnique({
    where: { id: input.templateId },
    select: { id: true, name: true, language: true, status: true },
  });
  if (!template || template.status !== TemplateStatus.APPROVED) {
    throw new Error("Selected WhatsApp template is not approved.");
  }

  const where = buildAudienceWhere(input.filters);
  const [total, recipients] = await prisma.$transaction([
    prisma.whatsAppContact.count({ where }),
    prisma.whatsAppContact.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: MAX_CAMPAIGN_BATCH,
      select: {
        id: true,
        phone: true,
        conversations: {
          orderBy: { lastMessageAt: "desc" },
          take: 1,
          select: { id: true },
        },
      },
    }),
  ]);

  if (total === 0) throw new Error("No opted-in recipients match this audience.");
  if (total > MAX_CAMPAIGN_BATCH) {
    throw new Error(
      `Audience has ${total} recipients. Narrow the segment or launch in batches of ${MAX_CAMPAIGN_BATCH}.`,
    );
  }

  const campaignId = randomUUID();
  const eventKey = `campaign:${campaignId}`;
  await prisma.webhookEvent.create({
    data: {
      eventKey,
      eventType: "targeted_campaign",
      attemptCount: 1,
      payload: toJson({
        campaignId,
        name,
        templateId: template.id,
        templateName: template.name,
        filters: input.filters,
        requestedRecipients: total,
        createdBy: input.actorId,
        createdAt: new Date().toISOString(),
      }),
    },
  });

  let queued = 0;
  let skipped = 0;
  const failures: Array<{ contactId: string; reason: string }> = [];

  for (const recipient of recipients) {
    const conversationId = recipient.conversations[0]?.id;
    if (!conversationId) {
      skipped += 1;
      continue;
    }

    try {
      const result = await queueOutboundMessage({
        conversationId,
        actor: MessageActor.COUNSELOR,
        sentById: input.actorId,
        content: {
          kind: "template",
          templateId: template.id,
          components: Array.isArray(input.components) ? input.components : [],
        },
        idempotencyKey: `campaign:${campaignId}:${recipient.id}`,
      });
      if (result.queued || result.duplicate) queued += 1;
    } catch (error) {
      skipped += 1;
      failures.push({
        contactId: recipient.id,
        reason: error instanceof Error ? error.message.slice(0, 300) : "Queue failed.",
      });
    }
  }

  await prisma.$transaction([
    prisma.webhookEvent.update({
      where: { eventKey },
      data: {
        processedAt: new Date(),
        payload: toJson({
          campaignId,
          name,
          templateId: template.id,
          templateName: template.name,
          filters: input.filters,
          requestedRecipients: total,
          queued,
          skipped,
          failures: failures.slice(0, 50),
          createdBy: input.actorId,
          processedAt: new Date().toISOString(),
        }),
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "TARGETED_CAMPAIGN_QUEUED",
        entityType: "TargetedCampaign",
        entityId: campaignId,
        after: toJson({ name, templateId: template.id, total, queued, skipped }),
      },
    }),
  ]);

  return {
    campaignId,
    name,
    template: template.name,
    total,
    queued,
    skipped,
    mode: getOutboundMode(),
  };
}
