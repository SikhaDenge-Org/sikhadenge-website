import {
  AgentMode,
  ConversationStatus,
  DashboardRole,
  Prisma,
} from "@prisma/client";

import { prisma } from "../db/prisma";
import {
  priorityBand,
  queuePriorityScore,
  queueSlaState,
  validateAgentModeTransition,
  validateConversationStatusTransition,
} from "./policy";

export type OperationActor = {
  id: string;
  role: DashboardRole;
};

export type OperationRequestContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function cleanReason(value?: string | null, maximum = 1_000): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned ? cleaned.slice(0, maximum) : null;
}

async function assertAssignableUser(userId: string) {
  const user = await prisma.dashboardUser.findFirst({
    where: {
      id: userId,
      isActive: true,
      role: {
        in: [DashboardRole.ADMIN, DashboardRole.MANAGER, DashboardRole.COUNSELOR],
      },
    },
    select: { id: true, name: true, role: true },
  });
  if (!user) throw new Error("Assignable active counselor was not found.");
  return user;
}

export async function setConversationMode(input: {
  conversationId: string;
  mode: AgentMode;
  reason?: string | null;
  actor: OperationActor;
  context?: OperationRequestContext;
}) {
  const existing = await prisma.whatsAppConversation.findUnique({
    where: { id: input.conversationId },
    select: {
      id: true,
      agentMode: true,
      assignedToId: true,
      humanTakeoverAt: true,
      humanTakeoverReason: true,
    },
  });
  if (!existing) throw new Error("Conversation not found.");

  validateAgentModeTransition(existing.agentMode, input.mode);
  const reason = cleanReason(input.reason, 500);

  return prisma.$transaction(async (transaction) => {
    const conversation = await transaction.whatsAppConversation.update({
      where: { id: existing.id },
      data: {
        agentMode: input.mode,
        assignedToId:
          input.mode === AgentMode.HUMAN && !existing.assignedToId
            ? input.actor.id
            : existing.assignedToId,
        humanTakeoverAt:
          input.mode === AgentMode.HUMAN
            ? existing.humanTakeoverAt ?? new Date()
            : null,
        humanTakeoverReason:
          input.mode === AgentMode.HUMAN ? reason : null,
      },
      select: {
        id: true,
        agentMode: true,
        assignedToId: true,
        humanTakeoverAt: true,
        humanTakeoverReason: true,
      },
    });

    if (conversation.assignedToId) {
      await transaction.lead.updateMany({
        where: { conversationId: conversation.id },
        data: { assignedToId: conversation.assignedToId },
      });
    }

    await transaction.auditLog.create({
      data: {
        actorId: input.actor.id,
        action: "CONVERSATION_MODE_CHANGED",
        entityType: "WhatsAppConversation",
        entityId: conversation.id,
        before: toJson(existing),
        after: toJson({ ...conversation, reason }),
        ipAddress: input.context?.ipAddress ?? null,
        userAgent: input.context?.userAgent ?? null,
      },
    });

    return conversation;
  });
}

export async function assignConversation(input: {
  conversationId: string;
  assigneeId: string | null;
  reason?: string | null;
  actor: OperationActor;
  context?: OperationRequestContext;
}) {
  if (
    input.actor.role === DashboardRole.COUNSELOR &&
    input.assigneeId !== null &&
    input.assigneeId !== input.actor.id
  ) {
    throw new Error("Counselors may assign conversations only to themselves.");
  }

  const assignee = input.assigneeId
    ? await assertAssignableUser(input.assigneeId)
    : null;
  const existing = await prisma.whatsAppConversation.findUnique({
    where: { id: input.conversationId },
    select: { id: true, assignedToId: true, agentMode: true },
  });
  if (!existing) throw new Error("Conversation not found.");

  const reason = cleanReason(input.reason, 500);
  return prisma.$transaction(async (transaction) => {
    const conversation = await transaction.whatsAppConversation.update({
      where: { id: existing.id },
      data: {
        assignedToId: assignee?.id ?? null,
        agentMode:
          assignee && existing.agentMode === AgentMode.AI
            ? AgentMode.HUMAN
            : existing.agentMode,
        humanTakeoverAt:
          assignee && existing.agentMode === AgentMode.AI ? new Date() : undefined,
        humanTakeoverReason:
          assignee && existing.agentMode === AgentMode.AI
            ? reason ?? "Assigned to counselor."
            : undefined,
      },
      select: {
        id: true,
        assignedToId: true,
        agentMode: true,
        humanTakeoverAt: true,
        humanTakeoverReason: true,
      },
    });

    await transaction.lead.updateMany({
      where: { conversationId: existing.id },
      data: { assignedToId: assignee?.id ?? null },
    });

    await transaction.auditLog.create({
      data: {
        actorId: input.actor.id,
        action: assignee ? "CONVERSATION_ASSIGNED" : "CONVERSATION_UNASSIGNED",
        entityType: "WhatsAppConversation",
        entityId: existing.id,
        before: toJson(existing),
        after: toJson({ ...conversation, assignee, reason }),
        ipAddress: input.context?.ipAddress ?? null,
        userAgent: input.context?.userAgent ?? null,
      },
    });

    return { conversation, assignee };
  });
}

export async function updateConversationStatus(input: {
  conversationId: string;
  status: ConversationStatus;
  reason?: string | null;
  actor: OperationActor;
  context?: OperationRequestContext;
}) {
  const existing = await prisma.whatsAppConversation.findUnique({
    where: { id: input.conversationId },
    select: { id: true, status: true, unreadCount: true },
  });
  if (!existing) throw new Error("Conversation not found.");

  validateConversationStatusTransition(existing.status, input.status);
  const reason = cleanReason(input.reason, 500);
  const conversation = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.whatsAppConversation.update({
      where: { id: existing.id },
      data: {
        status: input.status,
        unreadCount:
          input.status === ConversationStatus.RESOLVED ||
          input.status === ConversationStatus.CLOSED ||
          input.status === ConversationStatus.SPAM
            ? 0
            : existing.unreadCount,
      },
      select: { id: true, status: true, unreadCount: true },
    });

    await transaction.auditLog.create({
      data: {
        actorId: input.actor.id,
        action: "CONVERSATION_STATUS_CHANGED",
        entityType: "WhatsAppConversation",
        entityId: existing.id,
        before: toJson(existing),
        after: toJson({ ...updated, reason }),
        ipAddress: input.context?.ipAddress ?? null,
        userAgent: input.context?.userAgent ?? null,
      },
    });
    return updated;
  });

  return conversation;
}

export async function scheduleLeadFollowUp(input: {
  conversationId: string;
  followUpAt: Date | null;
  reason?: string | null;
  actor: OperationActor;
  context?: OperationRequestContext;
}) {
  const maximum = Date.now() + 366 * 24 * 60 * 60 * 1_000;
  if (input.followUpAt && input.followUpAt.getTime() > maximum) {
    throw new Error("Follow-up cannot be scheduled more than 366 days ahead.");
  }

  const lead = await prisma.lead.findUnique({
    where: { conversationId: input.conversationId },
    select: { id: true, nextFollowUpAt: true, assignedToId: true },
  });
  if (!lead) throw new Error("Lead was not found for this conversation.");

  const reason = cleanReason(input.reason);
  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.lead.update({
      where: { id: lead.id },
      data: {
        nextFollowUpAt: input.followUpAt,
        assignedToId: lead.assignedToId ?? input.actor.id,
      },
      select: { id: true, nextFollowUpAt: true, assignedToId: true },
    });

    await transaction.whatsAppConversation.update({
      where: { id: input.conversationId },
      data: {
        assignedToId: updated.assignedToId,
        status: input.followUpAt ? ConversationStatus.WAITING : undefined,
      },
    });

    await transaction.auditLog.create({
      data: {
        actorId: input.actor.id,
        action: input.followUpAt ? "LEAD_FOLLOW_UP_SCHEDULED" : "LEAD_FOLLOW_UP_CLEARED",
        entityType: "Lead",
        entityId: lead.id,
        before: toJson(lead),
        after: toJson({ ...updated, reason }),
        ipAddress: input.context?.ipAddress ?? null,
        userAgent: input.context?.userAgent ?? null,
      },
    });
    return updated;
  });
}

export async function addLeadNote(input: {
  conversationId: string;
  body: string;
  actor: OperationActor;
  context?: OperationRequestContext;
}) {
  const body = input.body.trim().replace(/\n{3,}/g, "\n\n");
  if (body.length < 2 || body.length > 5_000) {
    throw new Error("Lead note must contain 2-5,000 characters.");
  }

  const lead = await prisma.lead.findUnique({
    where: { conversationId: input.conversationId },
    select: { id: true },
  });
  if (!lead) throw new Error("Lead was not found for this conversation.");

  return prisma.$transaction(async (transaction) => {
    const note = await transaction.leadNote.create({
      data: { leadId: lead.id, authorId: input.actor.id, body },
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: { select: { id: true, name: true } },
      },
    });

    await transaction.auditLog.create({
      data: {
        actorId: input.actor.id,
        action: "LEAD_NOTE_ADDED",
        entityType: "LeadNote",
        entityId: note.id,
        after: toJson({ leadId: lead.id, bodyLength: body.length }),
        ipAddress: input.context?.ipAddress ?? null,
        userAgent: input.context?.userAgent ?? null,
      },
    });
    return note;
  });
}

export async function replaceConversationTags(input: {
  conversationId: string;
  tags: Array<{ name: string; color?: string | null }>;
  actor: OperationActor;
  context?: OperationRequestContext;
}) {
  const normalized = Array.from(
    new Map(
      input.tags.map((tag) => {
        const name = tag.name.trim().replace(/\s+/g, " ").slice(0, 60);
        const color = tag.color?.trim().slice(0, 30) || null;
        return [name.toLocaleLowerCase("en-IN"), { name, color }] as const;
      }),
    ).values(),
  ).filter((tag) => tag.name);

  if (normalized.length > 12) throw new Error("A conversation may have at most 12 tags.");

  const conversation = await prisma.whatsAppConversation.findUnique({
    where: { id: input.conversationId },
    select: {
      id: true,
      tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
    },
  });
  if (!conversation) throw new Error("Conversation not found.");

  return prisma.$transaction(async (transaction) => {
    const tagRecords = [];
    for (const tag of normalized) {
      const record = await transaction.conversationTag.upsert({
        where: { name: tag.name },
        create: { name: tag.name, color: tag.color },
        update: tag.color ? { color: tag.color } : {},
        select: { id: true, name: true, color: true },
      });
      tagRecords.push(record);
    }

    await transaction.conversationTagLink.deleteMany({
      where: { conversationId: conversation.id },
    });
    if (tagRecords.length > 0) {
      await transaction.conversationTagLink.createMany({
        data: tagRecords.map((tag) => ({
          conversationId: conversation.id,
          tagId: tag.id,
        })),
        skipDuplicates: true,
      });
    }

    await transaction.auditLog.create({
      data: {
        actorId: input.actor.id,
        action: "CONVERSATION_TAGS_REPLACED",
        entityType: "WhatsAppConversation",
        entityId: conversation.id,
        before: toJson(conversation.tags.map(({ tag }) => tag)),
        after: toJson(tagRecords),
        ipAddress: input.context?.ipAddress ?? null,
        userAgent: input.context?.userAgent ?? null,
      },
    });
    return tagRecords;
  });
}

export async function listOperationsQueue(input: {
  limit?: number;
  assignedToId?: string | null;
  onlyUnassigned?: boolean;
  onlyDue?: boolean;
}) {
  const now = new Date();
  const conversations = await prisma.whatsAppConversation.findMany({
    where: {
      assignedToId: input.onlyUnassigned
        ? null
        : input.assignedToId
          ? input.assignedToId
          : undefined,
      status: { not: ConversationStatus.SPAM },
    },
    take: Math.max(1, Math.min(250, input.limit ?? 100)),
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      status: true,
      agentMode: true,
      unreadCount: true,
      lastMessageAt: true,
      assignedToId: true,
      currentIntent: true,
      contact: {
        select: { displayName: true, profileName: true, phone: true },
      },
      assignedTo: { select: { id: true, name: true } },
      lead: {
        select: {
          temperature: true,
          stage: true,
          score: true,
          counselorRequested: true,
          nextFollowUpAt: true,
          interestedCourse: true,
        },
      },
    },
  });

  return conversations
    .map((conversation) => {
      const slaState = queueSlaState({
        now,
        nextFollowUpAt: conversation.lead?.nextFollowUpAt ?? null,
        lastMessageAt: conversation.lastMessageAt,
        status: conversation.status,
        unreadCount: conversation.unreadCount,
      });
      const priorityScore = queuePriorityScore({
        status: conversation.status,
        agentMode: conversation.agentMode,
        unreadCount: conversation.unreadCount,
        leadTemperature: conversation.lead?.temperature ?? null,
        counselorRequested: conversation.lead?.counselorRequested ?? false,
        assignedToId: conversation.assignedToId,
        slaState,
      });

      return {
        id: conversation.id,
        contactName:
          conversation.contact.displayName ||
          conversation.contact.profileName ||
          conversation.contact.phone,
        phone: conversation.contact.phone,
        status: conversation.status,
        agentMode: conversation.agentMode,
        unreadCount: conversation.unreadCount,
        lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
        assignee: conversation.assignedTo,
        currentIntent: conversation.currentIntent,
        lead: conversation.lead
          ? {
              ...conversation.lead,
              nextFollowUpAt:
                conversation.lead.nextFollowUpAt?.toISOString() ?? null,
            }
          : null,
        slaState,
        priorityScore,
        priorityBand: priorityBand(priorityScore),
      };
    })
    .filter((item) =>
      input.onlyDue
        ? item.slaState === "OVERDUE" || item.slaState === "DUE_SOON"
        : true,
    )
    .sort((left, right) => right.priorityScore - left.priorityScore);
}
