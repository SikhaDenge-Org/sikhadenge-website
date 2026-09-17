import {
  ConversationStatus,
  DashboardRole,
  LeadStage,
  LeadTemperature,
  Prisma,
} from "@prisma/client";

import { prisma } from "../db/prisma";

export type LeadFilters = {
  search?: string;
  stage?: string;
  temperature?: string;
  assignedToId?: string;
  due?: boolean;
  limit?: number;
};

export type LeadUpdateInput = {
  stage?: unknown;
  temperature?: unknown;
  score?: unknown;
  occupation?: unknown;
  experienceLevel?: unknown;
  goal?: unknown;
  interestedCourse?: unknown;
  joiningTimeline?: unknown;
  classAvailability?: unknown;
  feeUnderstood?: unknown;
  counselorRequested?: unknown;
  nextFollowUpAt?: unknown;
  assignedToId?: unknown;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function clean(value: unknown, maximum = 500): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, maximum) : null;
}

function normalizeStage(value: unknown): LeadStage {
  const normalized = clean(value, 40)?.toUpperCase();
  if (!normalized || !Object.values(LeadStage).includes(normalized as LeadStage)) {
    throw new Error("Invalid lead stage.");
  }
  return normalized as LeadStage;
}

function normalizeTemperature(value: unknown): LeadTemperature {
  const normalized = clean(value, 30)?.toUpperCase();
  if (
    !normalized ||
    !Object.values(LeadTemperature).includes(normalized as LeadTemperature)
  ) {
    throw new Error("Invalid lead temperature.");
  }
  return normalized as LeadTemperature;
}

function normalizeScore(value: unknown): number {
  const score = Number(value);
  if (!Number.isFinite(score)) throw new Error("Lead score must be numeric.");
  const integer = Math.floor(score);
  if (integer < 0 || integer > 100) throw new Error("Lead score must be between 0 and 100.");
  return integer;
}

function normalizeBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${field} must be true or false.`);
  return value;
}

function normalizeDate(value: unknown): Date | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new Error("Follow-up date is invalid.");
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("Follow-up date is invalid.");
  const maximum = Date.now() + 366 * 24 * 60 * 60 * 1_000;
  if (parsed.getTime() > maximum) {
    throw new Error("Follow-up cannot be scheduled more than 366 days ahead.");
  }
  return parsed;
}

async function validateAssignee(value: unknown) {
  const assigneeId = clean(value, 80);
  if (!assigneeId) return null;
  const user = await prisma.dashboardUser.findFirst({
    where: {
      id: assigneeId,
      isActive: true,
      role: { in: [DashboardRole.ADMIN, DashboardRole.MANAGER, DashboardRole.COUNSELOR] },
    },
    select: { id: true, name: true, role: true },
  });
  if (!user) throw new Error("Active counselor was not found.");
  return user;
}

function slaState(nextFollowUpAt: Date | null, now: Date): string {
  if (!nextFollowUpAt) return "NONE";
  if (nextFollowUpAt.getTime() < now.getTime()) return "OVERDUE";
  if (nextFollowUpAt.getTime() <= now.getTime() + 24 * 60 * 60 * 1_000) {
    return "DUE_SOON";
  }
  return "SCHEDULED";
}

const leadInclude = {
  contact: {
    select: {
      id: true,
      displayName: true,
      profileName: true,
      phone: true,
      city: true,
      email: true,
      language: true,
      consentStatus: true,
    },
  },
  conversation: {
    select: {
      id: true,
      status: true,
      agentMode: true,
      unreadCount: true,
      lastMessageAt: true,
      currentIntent: true,
      assignedTo: { select: { id: true, name: true } },
      tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
      messages: {
        orderBy: { messageTimestamp: "desc" as const },
        take: 4,
        select: {
          id: true,
          direction: true,
          actor: true,
          type: true,
          status: true,
          text: true,
          filename: true,
          messageTimestamp: true,
        },
      },
    },
  },
  assignedTo: { select: { id: true, name: true, role: true } },
  notes: {
    orderBy: { createdAt: "desc" as const },
    take: 20,
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: { select: { id: true, name: true } },
    },
  },
};

function mapLead(lead: Prisma.LeadGetPayload<{ include: typeof leadInclude }>, now: Date) {
  return {
    id: lead.id,
    contactId: lead.contactId,
    conversationId: lead.conversationId,
    stage: lead.stage,
    temperature: lead.temperature,
    score: lead.score,
    occupation: lead.occupation,
    experienceLevel: lead.experienceLevel,
    goal: lead.goal,
    interestedCourse: lead.interestedCourse,
    joiningTimeline: lead.joiningTimeline,
    classAvailability: lead.classAvailability,
    feeUnderstood: lead.feeUnderstood,
    counselorRequested: lead.counselorRequested,
    nextFollowUpAt: lead.nextFollowUpAt?.toISOString() ?? null,
    qualifiedAt: lead.qualifiedAt?.toISOString() ?? null,
    closedAt: lead.closedAt?.toISOString() ?? null,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
    slaState: slaState(lead.nextFollowUpAt, now),
    contact: {
      id: lead.contact.id,
      name:
        lead.contact.displayName ||
        lead.contact.profileName ||
        lead.contact.phone,
      phone: lead.contact.phone,
      city: lead.contact.city,
      email: lead.contact.email,
      language: lead.contact.language,
      consentStatus: lead.contact.consentStatus,
    },
    conversation: {
      ...lead.conversation,
      lastMessageAt: lead.conversation.lastMessageAt?.toISOString() ?? null,
      tags: lead.conversation.tags.map(({ tag }) => tag),
      messages: lead.conversation.messages.map((message) => ({
        ...message,
        messageTimestamp: message.messageTimestamp.toISOString(),
      })),
    },
    assignedTo: lead.assignedTo,
    notes: lead.notes.map((note) => ({
      ...note,
      createdAt: note.createdAt.toISOString(),
    })),
  };
}

export async function listLeads(filters: LeadFilters = {}) {
  const now = new Date();
  const search = clean(filters.search, 120);
  const stage = clean(filters.stage, 40)?.toUpperCase();
  const temperature = clean(filters.temperature, 30)?.toUpperCase();
  const assignedToId = clean(filters.assignedToId, 80);
  const limit = Math.max(1, Math.min(500, Math.floor(filters.limit ?? 250)));
  const dueBefore = new Date(now.getTime() + 24 * 60 * 60 * 1_000);

  const where: Prisma.LeadWhereInput = {
    ...(search
      ? {
          OR: [
            { contact: { displayName: { contains: search, mode: "insensitive" } } },
            { contact: { profileName: { contains: search, mode: "insensitive" } } },
            { contact: { phone: { contains: search } } },
            { contact: { city: { contains: search, mode: "insensitive" } } },
            { interestedCourse: { contains: search, mode: "insensitive" } },
            { goal: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(stage && stage !== "ALL" ? { stage: normalizeStage(stage) } : {}),
    ...(temperature && temperature !== "ALL"
      ? { temperature: normalizeTemperature(temperature) }
      : {}),
    ...(assignedToId && assignedToId !== "ALL" ? { assignedToId } : {}),
    ...(filters.due
      ? { nextFollowUpAt: { not: null, lte: dueBefore } }
      : {}),
  };

  const [leads, total, hot, overdue, enrolled, paymentPending, counselors, performanceRows] =
    await prisma.$transaction([
      prisma.lead.findMany({
        where,
        include: leadInclude,
        orderBy: [
          { nextFollowUpAt: { sort: "asc", nulls: "last" } },
          { score: "desc" },
          { updatedAt: "desc" },
        ],
        take: limit,
      }),
      prisma.lead.count(),
      prisma.lead.count({ where: { temperature: LeadTemperature.HOT } }),
      prisma.lead.count({ where: { nextFollowUpAt: { lt: now } } }),
      prisma.lead.count({ where: { stage: LeadStage.ENROLLED } }),
      prisma.lead.count({ where: { stage: LeadStage.PAYMENT_PENDING } }),
      prisma.dashboardUser.findMany({
        where: {
          isActive: true,
          role: { in: [DashboardRole.ADMIN, DashboardRole.MANAGER, DashboardRole.COUNSELOR] },
        },
        select: { id: true, name: true, role: true },
        orderBy: { name: "asc" },
      }),
      prisma.lead.findMany({
        where: { assignedToId: { not: null } },
        select: {
          assignedToId: true,
          stage: true,
          score: true,
          nextFollowUpAt: true,
        },
      }),
    ]);

  const performance = counselors.map((counselor) => {
    const assigned = performanceRows.filter((row) => row.assignedToId === counselor.id);
    const averageScore = assigned.length
      ? Math.round(assigned.reduce((sum, row) => sum + row.score, 0) / assigned.length)
      : 0;
    return {
      ...counselor,
      assigned: assigned.length,
      enrolled: assigned.filter((row) => row.stage === LeadStage.ENROLLED).length,
      due: assigned.filter(
        (row) => row.nextFollowUpAt && row.nextFollowUpAt.getTime() <= dueBefore.getTime(),
      ).length,
      averageScore,
    };
  });

  return {
    leads: leads.map((lead) => mapLead(lead, now)),
    metrics: { total, hot, overdue, enrolled, paymentPending },
    options: { counselors },
    performance,
  };
}

export async function updateLead(input: {
  leadId: string;
  values: LeadUpdateInput;
  actorId: string;
}) {
  const existing = await prisma.lead.findUnique({
    where: { id: input.leadId },
    include: leadInclude,
  });
  if (!existing) throw new Error("Lead not found.");

  const values = input.values;
  const data: Prisma.LeadUpdateInput = {};
  let assignee: Awaited<ReturnType<typeof validateAssignee>> | undefined;

  if (Object.prototype.hasOwnProperty.call(values, "stage")) {
    const stage = normalizeStage(values.stage);
    data.stage = stage;
    const isQualifiedStage =
      stage === LeadStage.QUALIFIED ||
      stage === LeadStage.COUNSELOR_ASSIGNED ||
      stage === LeadStage.DEMO_BOOKED ||
      stage === LeadStage.PAYMENT_PENDING ||
      stage === LeadStage.ENROLLED;
    data.qualifiedAt = isQualifiedStage
      ? existing.qualifiedAt ?? new Date()
      : existing.qualifiedAt;
    data.closedAt = stage === LeadStage.CLOSED ? existing.closedAt ?? new Date() : null;
  }
  if (Object.prototype.hasOwnProperty.call(values, "temperature")) {
    data.temperature = normalizeTemperature(values.temperature);
  }
  if (Object.prototype.hasOwnProperty.call(values, "score")) {
    data.score = normalizeScore(values.score);
  }
  if (Object.prototype.hasOwnProperty.call(values, "occupation")) {
    data.occupation = clean(values.occupation, 160);
  }
  if (Object.prototype.hasOwnProperty.call(values, "experienceLevel")) {
    data.experienceLevel = clean(values.experienceLevel, 120);
  }
  if (Object.prototype.hasOwnProperty.call(values, "goal")) {
    data.goal = clean(values.goal, 1_500);
  }
  if (Object.prototype.hasOwnProperty.call(values, "interestedCourse")) {
    data.interestedCourse = clean(values.interestedCourse, 180);
  }
  if (Object.prototype.hasOwnProperty.call(values, "joiningTimeline")) {
    data.joiningTimeline = clean(values.joiningTimeline, 120);
  }
  if (Object.prototype.hasOwnProperty.call(values, "classAvailability")) {
    data.classAvailability = clean(values.classAvailability, 180);
  }
  if (Object.prototype.hasOwnProperty.call(values, "feeUnderstood")) {
    data.feeUnderstood = normalizeBoolean(values.feeUnderstood, "feeUnderstood");
  }
  if (Object.prototype.hasOwnProperty.call(values, "counselorRequested")) {
    data.counselorRequested = normalizeBoolean(
      values.counselorRequested,
      "counselorRequested",
    );
  }
  if (Object.prototype.hasOwnProperty.call(values, "nextFollowUpAt")) {
    data.nextFollowUpAt = normalizeDate(values.nextFollowUpAt);
  }
  if (Object.prototype.hasOwnProperty.call(values, "assignedToId")) {
    assignee = await validateAssignee(values.assignedToId);
    data.assignedTo = assignee
      ? { connect: { id: assignee.id } }
      : { disconnect: true };
  }

  if (Object.keys(data).length === 0) throw new Error("No lead changes were supplied.");

  const updated = await prisma.$transaction(async (transaction) => {
    const lead = await transaction.lead.update({
      where: { id: existing.id },
      data,
      include: leadInclude,
    });

    if (assignee !== undefined || Object.prototype.hasOwnProperty.call(values, "nextFollowUpAt")) {
      await transaction.whatsAppConversation.update({
        where: { id: existing.conversationId },
        data: {
          ...(assignee !== undefined ? { assignedToId: assignee?.id ?? null } : {}),
          ...(Object.prototype.hasOwnProperty.call(values, "nextFollowUpAt") &&
          lead.nextFollowUpAt
            ? { status: ConversationStatus.WAITING }
            : {}),
        },
      });
    }

    await transaction.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "LEAD_UPDATED",
        entityType: "Lead",
        entityId: existing.id,
        before: toJson({
          stage: existing.stage,
          temperature: existing.temperature,
          score: existing.score,
          assignedToId: existing.assignedToId,
          nextFollowUpAt: existing.nextFollowUpAt,
        }),
        after: toJson(values),
      },
    });
    return lead;
  });

  return mapLead(updated, new Date());
}

export async function addLeadNote(input: {
  leadId: string;
  body: unknown;
  actorId: string;
}) {
  const body = clean(input.body, 5_000);
  if (!body || body.length < 2) throw new Error("Note must contain at least 2 characters.");
  const lead = await prisma.lead.findUnique({ where: { id: input.leadId }, select: { id: true } });
  if (!lead) throw new Error("Lead not found.");

  return prisma.$transaction(async (transaction) => {
    const note = await transaction.leadNote.create({
      data: { leadId: lead.id, authorId: input.actorId, body },
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: { select: { id: true, name: true } },
      },
    });
    await transaction.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "LEAD_NOTE_ADDED",
        entityType: "LeadNote",
        entityId: note.id,
        after: toJson({ leadId: lead.id, bodyLength: body.length }),
      },
    });
    return { ...note, createdAt: note.createdAt.toISOString() };
  });
}

export async function bulkUpdateLeads(input: {
  leadIds: unknown;
  values: LeadUpdateInput;
  actorId: string;
}) {
  if (!Array.isArray(input.leadIds)) throw new Error("leadIds must be an array.");
  const leadIds = Array.from(
    new Set(input.leadIds.filter((value): value is string => typeof value === "string")),
  ).slice(0, 100);
  if (leadIds.length === 0) throw new Error("Select at least one lead.");

  const values = input.values;
  const data: Prisma.LeadUpdateManyMutationInput = {};
  let assignee: Awaited<ReturnType<typeof validateAssignee>> | undefined;

  if (Object.prototype.hasOwnProperty.call(values, "stage")) {
    data.stage = normalizeStage(values.stage);
  }
  if (Object.prototype.hasOwnProperty.call(values, "temperature")) {
    data.temperature = normalizeTemperature(values.temperature);
  }
  if (Object.prototype.hasOwnProperty.call(values, "assignedToId")) {
    assignee = await validateAssignee(values.assignedToId);
    (data as Prisma.LeadUncheckedUpdateManyInput).assignedToId = assignee?.id ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(values, "nextFollowUpAt")) {
    data.nextFollowUpAt = normalizeDate(values.nextFollowUpAt);
  }
  if (Object.keys(data).length === 0) throw new Error("No bulk changes were supplied.");

  const leads = await prisma.lead.findMany({
    where: { id: { in: leadIds } },
    select: { id: true, conversationId: true },
  });
  if (leads.length === 0) throw new Error("Selected leads were not found.");

  const result = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.lead.updateMany({
      where: { id: { in: leads.map((lead) => lead.id) } },
      data,
    });
    if (assignee !== undefined) {
      await transaction.whatsAppConversation.updateMany({
        where: { id: { in: leads.map((lead) => lead.conversationId) } },
        data: { assignedToId: assignee?.id ?? null },
      });
    }
    await transaction.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "LEADS_BULK_UPDATED",
        entityType: "Lead",
        after: toJson({ leadIds: leads.map((lead) => lead.id), values }),
      },
    });
    return updated.count;
  });

  return { updated: result };
}
