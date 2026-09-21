import { prisma } from "../db/prisma";
import type {
  InboxConversationDetail,
  InboxConversationSummary,
} from "./types";

function contactName(contact: {
  displayName: string | null;
  profileName: string | null;
  phone: string;
}): string {
  return contact.displayName || contact.profileName || contact.phone;
}

function mapLead(lead: {
  stage: string;
  temperature: string;
  score: number;
  occupation: string | null;
  experienceLevel: string | null;
  goal: string | null;
  interestedCourse: string | null;
  joiningTimeline: string | null;
  classAvailability: string | null;
  feeUnderstood: boolean;
  counselorRequested: boolean;
  nextFollowUpAt: Date | null;
} | null): InboxConversationSummary["lead"] {
  if (!lead) return null;

  return {
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
  };
}

export async function listInboxConversations(
  limit = 50,
): Promise<InboxConversationSummary[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 100);

  const conversations = await prisma.whatsAppConversation.findMany({
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    take: safeLimit,
    include: {
      contact: true,
      lead: true,
      assignedTo: { select: { id: true, name: true } },
      messages: {
        orderBy: { messageTimestamp: "desc" },
        take: 1,
        select: {
          text: true,
          type: true,
          direction: true,
          messageTimestamp: true,
        },
      },
    },
  });

  return conversations.map((conversation) => {
    const lastMessage = conversation.messages[0];

    return {
      id: conversation.id,
      contact: {
        id: conversation.contact.id,
        name: contactName(conversation.contact),
        phone: conversation.contact.phone,
        city: conversation.contact.city,
        email: conversation.contact.email,
      },
      status: conversation.status,
      agentMode: conversation.agentMode,
      unreadCount: conversation.unreadCount,
      lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
      lastMessage: lastMessage
        ? {
            text: lastMessage.text,
            type: lastMessage.type,
            direction: lastMessage.direction,
            timestamp: lastMessage.messageTimestamp.toISOString(),
          }
        : null,
      lead: mapLead(conversation.lead),
      assignee: conversation.assignedTo,
    };
  });
}

export async function getInboxConversation(
  conversationId: string,
): Promise<InboxConversationDetail | null> {
  const conversation = await prisma.whatsAppConversation.findUnique({
    where: { id: conversationId },
    include: {
      contact: true,
      lead: true,
      assignedTo: { select: { id: true, name: true } },
      messages: {
        orderBy: { messageTimestamp: "asc" },
        take: 200,
        select: {
          id: true,
          metaMessageId: true,
          direction: true,
          actor: true,
          type: true,
          status: true,
          text: true,
          mediaUrl: true,
          mimeType: true,
          filename: true,
          aiConfidence: true,
          messageTimestamp: true,
        },
      },
      tags: {
        include: { tag: true },
      },
    },
  });

  if (!conversation) return null;

  const latestMessage = conversation.messages.at(-1) ?? null;

  return {
    id: conversation.id,
    contact: {
      id: conversation.contact.id,
      name: contactName(conversation.contact),
      phone: conversation.contact.phone,
      city: conversation.contact.city,
      email: conversation.contact.email,
    },
    status: conversation.status,
    agentMode: conversation.agentMode,
    unreadCount: conversation.unreadCount,
    lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
    lastMessage: latestMessage
      ? {
          text: latestMessage.text,
          type: latestMessage.type,
          direction: latestMessage.direction,
          timestamp: latestMessage.messageTimestamp.toISOString(),
        }
      : null,
    lead: mapLead(conversation.lead),
    assignee: conversation.assignedTo,
    source: conversation.source,
    campaign: conversation.campaign,
    currentIntent: conversation.currentIntent,
    detectedLanguage: conversation.detectedLanguage,
    aiConfidence: conversation.aiConfidence,
    aiSummary: conversation.aiSummary,
    serviceWindowExpiresAt:
      conversation.serviceWindowExpiresAt?.toISOString() ?? null,
    messages: conversation.messages.map((message) => ({
      ...message,
      messageTimestamp: message.messageTimestamp.toISOString(),
    })),
    tags: conversation.tags.map(({ tag }) => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
    })),
  };
}
