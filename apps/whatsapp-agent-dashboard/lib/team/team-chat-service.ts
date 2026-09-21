import {
  AgentMode,
  ConversationStatus,
  DashboardRole,
  Prisma,
} from "@prisma/client";

import { prisma } from "../db/prisma";

export type TeamActor = {
  id: string;
  role: DashboardRole;
};

export type OwnershipAction = "claim" | "release" | "transfer";

const SUPPORT_ROLES: DashboardRole[] = [
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
  DashboardRole.COUNSELOR,
];

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function canManageTeam(role: DashboardRole): boolean {
  return role === DashboardRole.ADMIN || role === DashboardRole.MANAGER;
}

async function assertAssignableUser(userId: string) {
  const user = await prisma.dashboardUser.findFirst({
    where: {
      id: userId,
      isActive: true,
      role: { in: SUPPORT_ROLES },
    },
    select: { id: true, name: true, role: true },
  });
  if (!user) throw new Error("Active support agent was not found.");
  return user;
}

export async function listTeamOverview(actor: TeamActor) {
  const now = new Date();
  const onlineSince = new Date(now.getTime() - 2 * 60 * 1_000);

  const [agents, conversations] = await prisma.$transaction([
    prisma.dashboardUser.findMany({
      where: { isActive: true, role: { in: SUPPORT_ROLES } },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        sessions: {
          where: {
            revokedAt: null,
            expiresAt: { gt: now },
            lastSeenAt: { gte: onlineSince },
          },
          select: { lastSeenAt: true },
          orderBy: { lastSeenAt: "desc" },
          take: 1,
        },
        _count: {
          select: {
            assignedConversations: {
              where: {
                status: {
                  in: [
                    ConversationStatus.OPEN,
                    ConversationStatus.WAITING,
                    ConversationStatus.RESOLVED,
                  ],
                },
              },
            },
          },
        },
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    prisma.whatsAppConversation.findMany({
      where: {
        status: {
          in: [
            ConversationStatus.OPEN,
            ConversationStatus.WAITING,
            ConversationStatus.RESOLVED,
          ],
        },
      },
      select: {
        id: true,
        status: true,
        agentMode: true,
        unreadCount: true,
        currentIntent: true,
        lastMessageAt: true,
        updatedAt: true,
        humanTakeoverAt: true,
        humanTakeoverReason: true,
        contact: {
          select: {
            displayName: true,
            profileName: true,
            phone: true,
            city: true,
          },
        },
        assignedTo: { select: { id: true, name: true, role: true } },
        lead: {
          select: {
            stage: true,
            temperature: true,
            score: true,
            interestedCourse: true,
            nextFollowUpAt: true,
            counselorRequested: true,
          },
        },
        messages: {
          orderBy: { messageTimestamp: "desc" },
          take: 1,
          select: {
            text: true,
            type: true,
            direction: true,
            status: true,
            messageTimestamp: true,
          },
        },
      },
      orderBy: [{ unreadCount: "desc" }, { lastMessageAt: "desc" }],
      take: 300,
    }),
  ]);

  const queue = conversations.map((conversation) => {
    const lastMessage = conversation.messages[0] ?? null;
    const waitingMinutes = conversation.lastMessageAt
      ? Math.max(0, Math.floor((now.getTime() - conversation.lastMessageAt.getTime()) / 60_000))
      : null;
    const priority =
      conversation.unreadCount * 12 +
      (conversation.agentMode === AgentMode.REVIEW_REQUIRED ? 35 : 0) +
      (conversation.lead?.counselorRequested ? 30 : 0) +
      (conversation.lead?.temperature === "HOT" ? 25 : 0) +
      (conversation.assignedTo ? 0 : 15) +
      Math.min(20, waitingMinutes == null ? 0 : Math.floor(waitingMinutes / 15));

    return {
      id: conversation.id,
      contactName:
        conversation.contact.displayName ||
        conversation.contact.profileName ||
        conversation.contact.phone,
      phone: conversation.contact.phone,
      city: conversation.contact.city,
      status: conversation.status,
      agentMode: conversation.agentMode,
      unreadCount: conversation.unreadCount,
      currentIntent: conversation.currentIntent,
      lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
      updatedAt: conversation.updatedAt.toISOString(),
      humanTakeoverAt: conversation.humanTakeoverAt?.toISOString() ?? null,
      humanTakeoverReason: conversation.humanTakeoverReason,
      assignee: conversation.assignedTo,
      lead: conversation.lead
        ? {
            ...conversation.lead,
            nextFollowUpAt: conversation.lead.nextFollowUpAt?.toISOString() ?? null,
          }
        : null,
      lastMessage: lastMessage
        ? {
            ...lastMessage,
            messageTimestamp: lastMessage.messageTimestamp.toISOString(),
          }
        : null,
      waitingMinutes,
      priority,
      mine: conversation.assignedTo?.id === actor.id,
    };
  });

  return {
    generatedAt: now.toISOString(),
    currentUser: {
      id: actor.id,
      role: actor.role,
      canManageTeam: canManageTeam(actor.role),
    },
    metrics: {
      totalActive: queue.length,
      unassigned: queue.filter((item) => !item.assignee).length,
      unread: queue.reduce((total, item) => total + item.unreadCount, 0),
      reviewRequired: queue.filter((item) => item.agentMode === AgentMode.REVIEW_REQUIRED).length,
      mine: queue.filter((item) => item.mine).length,
      onlineAgents: agents.filter((agent) => agent.sessions.length > 0).length,
    },
    agents: agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      email: agent.email,
      role: agent.role,
      online: agent.sessions.length > 0,
      lastSeenAt: agent.sessions[0]?.lastSeenAt.toISOString() ?? null,
      assignedConversations: agent._count.assignedConversations,
      isCurrentUser: agent.id === actor.id,
    })),
    queue: queue.sort((left, right) => right.priority - left.priority),
  };
}

export async function changeConversationOwnership(input: {
  conversationId: string;
  action: OwnershipAction;
  assigneeId?: string | null;
  actor: TeamActor;
}) {
  if (!SUPPORT_ROLES.includes(input.actor.role)) {
    throw new Error("This account cannot manage conversations.");
  }

  const existing = await prisma.whatsAppConversation.findUnique({
    where: { id: input.conversationId },
    select: {
      id: true,
      assignedToId: true,
      agentMode: true,
      status: true,
      updatedAt: true,
      assignedTo: { select: { id: true, name: true, role: true } },
    },
  });
  if (!existing) throw new Error("Conversation not found.");

  if (input.action === "claim") {
    if (existing.assignedToId && existing.assignedToId !== input.actor.id) {
      throw new Error(`Conversation is already owned by ${existing.assignedTo?.name || "another agent"}.`);
    }

    return prisma.$transaction(async (transaction) => {
      const claimed = await transaction.whatsAppConversation.updateMany({
        where: {
          id: existing.id,
          OR: [{ assignedToId: null }, { assignedToId: input.actor.id }],
        },
        data: {
          assignedToId: input.actor.id,
          agentMode: AgentMode.HUMAN,
          humanTakeoverAt: new Date(),
          humanTakeoverReason: "Claimed from multi-agent queue.",
        },
      });
      if (claimed.count !== 1) {
        throw new Error("Conversation was claimed by another agent. Refresh the queue.");
      }

      await transaction.lead.updateMany({
        where: { conversationId: existing.id },
        data: { assignedToId: input.actor.id },
      });
      await transaction.auditLog.create({
        data: {
          actorId: input.actor.id,
          action: "TEAM_CONVERSATION_CLAIMED",
          entityType: "WhatsAppConversation",
          entityId: existing.id,
          before: toJson(existing),
          after: toJson({ assignedToId: input.actor.id, agentMode: AgentMode.HUMAN }),
        },
      });

      return transaction.whatsAppConversation.findUnique({
        where: { id: existing.id },
        select: {
          id: true,
          assignedToId: true,
          agentMode: true,
          assignedTo: { select: { id: true, name: true, role: true } },
        },
      });
    });
  }

  if (input.action === "release") {
    if (
      !canManageTeam(input.actor.role) &&
      existing.assignedToId !== input.actor.id
    ) {
      throw new Error("Counselors may release only their own conversations.");
    }

    return prisma.$transaction(async (transaction) => {
      const released = await transaction.whatsAppConversation.updateMany({
        where: {
          id: existing.id,
          ...(canManageTeam(input.actor.role)
            ? {}
            : { assignedToId: input.actor.id }),
        },
        data: {
          assignedToId: null,
          agentMode: AgentMode.PAUSED,
          humanTakeoverAt: null,
          humanTakeoverReason: "Released to the unassigned queue.",
        },
      });
      if (released.count !== 1) {
        throw new Error("Conversation ownership changed. Refresh the queue.");
      }

      await transaction.lead.updateMany({
        where: { conversationId: existing.id },
        data: { assignedToId: null },
      });
      await transaction.auditLog.create({
        data: {
          actorId: input.actor.id,
          action: "TEAM_CONVERSATION_RELEASED",
          entityType: "WhatsAppConversation",
          entityId: existing.id,
          before: toJson(existing),
          after: toJson({ assignedToId: null, agentMode: AgentMode.PAUSED }),
        },
      });

      return transaction.whatsAppConversation.findUnique({
        where: { id: existing.id },
        select: {
          id: true,
          assignedToId: true,
          agentMode: true,
          assignedTo: { select: { id: true, name: true, role: true } },
        },
      });
    });
  }

  if (!canManageTeam(input.actor.role)) {
    throw new Error("Only admins and managers may transfer conversations.");
  }
  const assigneeId = typeof input.assigneeId === "string" ? input.assigneeId.trim() : "";
  if (!assigneeId) throw new Error("assigneeId is required for a transfer.");
  const assignee = await assertAssignableUser(assigneeId);

  return prisma.$transaction(async (transaction) => {
    const conversation = await transaction.whatsAppConversation.update({
      where: { id: existing.id },
      data: {
        assignedToId: assignee.id,
        agentMode: AgentMode.HUMAN,
        humanTakeoverAt: new Date(),
        humanTakeoverReason: `Transferred by team manager to ${assignee.name}.`,
      },
      select: {
        id: true,
        assignedToId: true,
        agentMode: true,
        assignedTo: { select: { id: true, name: true, role: true } },
      },
    });

    await transaction.lead.updateMany({
      where: { conversationId: existing.id },
      data: { assignedToId: assignee.id },
    });
    await transaction.auditLog.create({
      data: {
        actorId: input.actor.id,
        action: "TEAM_CONVERSATION_TRANSFERRED",
        entityType: "WhatsAppConversation",
        entityId: existing.id,
        before: toJson(existing),
        after: toJson({ assignedTo: assignee, agentMode: AgentMode.HUMAN }),
      },
    });

    return conversation;
  });
}

export async function assertManualSendOwnership(input: {
  conversationId: string;
  actor: TeamActor;
}) {
  const conversation = await prisma.whatsAppConversation.findUnique({
    where: { id: input.conversationId },
    select: {
      id: true,
      assignedToId: true,
      agentMode: true,
      assignedTo: { select: { name: true } },
    },
  });
  if (!conversation) throw new Error("Conversation not found.");

  if (canManageTeam(input.actor.role)) return conversation;
  if (conversation.assignedToId !== input.actor.id) {
    throw new Error(
      conversation.assignedToId
        ? `Conversation is owned by ${conversation.assignedTo?.name || "another agent"}.`
        : "Claim this conversation before sending a manual reply.",
    );
  }
  if (conversation.agentMode !== AgentMode.HUMAN) {
    throw new Error("Switch this conversation to Human mode before sending a manual reply.");
  }
  return conversation;
}
