import { Prisma } from "@prisma/client";

import { prisma } from "../db/prisma";
import {
  inboxConversationTimeFilter,
  renderWhatsAppTemplateText,
  type InboxConversationScope,
} from "./conversation-read-policy";
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

function jsonRecord(
  value: Prisma.JsonValue | null,
): Record<string, unknown> {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function outboundMetadata(
  rawPayload: Prisma.JsonValue | null,
): Record<string, unknown> {
  const root = jsonRecord(rawPayload);
  const outbound = root.outbound;

  return outbound &&
    typeof outbound === "object" &&
    !Array.isArray(outbound)
    ? (outbound as Record<string, unknown>)
    : {};
}

function templateBody(
  components: Prisma.JsonValue,
): string {
  if (!Array.isArray(components)) return "";

  for (const component of components) {
    if (
      !component ||
      typeof component !== "object" ||
      Array.isArray(component)
    ) {
      continue;
    }

    const record =
      component as Record<string, unknown>;

    if (
      String(record.type || "").toUpperCase()
        !== "BODY"
    ) {
      continue;
    }

    return typeof record.text === "string"
      ? record.text
      : "";
  }

  return "";
}

function templateBodyParameters(
  rawPayload: Prisma.JsonValue | null,
): string[] {
  const metadata =
    outboundMetadata(rawPayload);

  const components =
    Array.isArray(metadata.components)
      ? metadata.components
      : [];

  for (const component of components) {
    if (
      !component ||
      typeof component !== "object" ||
      Array.isArray(component)
    ) {
      continue;
    }

    const record =
      component as Record<string, unknown>;

    if (
      String(record.type || "").toLowerCase()
        !== "body"
    ) {
      continue;
    }

    const parameters =
      Array.isArray(record.parameters)
        ? record.parameters
        : [];

    return parameters.map((parameter) => {
      if (
        !parameter ||
        typeof parameter !== "object" ||
        Array.isArray(parameter)
      ) {
        return "";
      }

      const value =
        parameter as Record<string, unknown>;

      return typeof value.text === "string"
        ? value.text
        : "";
    });
  }

  return [];
}

function templateIdFromPayload(
  rawPayload: Prisma.JsonValue | null,
): string | null {
  const metadata =
    outboundMetadata(rawPayload);

  return typeof metadata.templateId === "string"
    ? metadata.templateId
    : null;
}

function resolveTemplateMessageText(
  input: {
    text: string | null;
    rawPayload: Prisma.JsonValue | null;
  },
  templates: Map<string, string>,
): string | null {
  if (input.text?.trim()) {
    return input.text;
  }

  const templateId =
    templateIdFromPayload(input.rawPayload);

  if (!templateId) {
    return input.text;
  }

  const body =
    templates.get(templateId) || "";

  if (!body) {
    return input.text;
  }

  const parameters =
    templateBodyParameters(input.rawPayload);

  return renderWhatsAppTemplateText(
    body,
    parameters,
  ) || input.text;
}

async function templateBodiesForMessages(
  messages: Array<{
    rawPayload: Prisma.JsonValue | null;
  }>,
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(
      messages
        .map((message) =>
          templateIdFromPayload(
            message.rawPayload,
          ),
        )
        .filter(
          (value): value is string =>
            Boolean(value),
        ),
    ),
  ];

  if (ids.length === 0) {
    return new Map();
  }

  const templates =
    await prisma.whatsAppTemplate.findMany({
      where: {
        id: {
          in: ids,
        },
      },
      select: {
        id: true,
        components: true,
      },
    });

  return new Map(
    templates.map((template) => [
      template.id,
      templateBody(template.components),
    ]),
  );
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
  limit: number | null = 50,
  scope: InboxConversationScope = "ALL",
): Promise<InboxConversationSummary[]> {
  const safeLimit =
    limit == null
      ? null
      : Math.min(
          Math.max(Math.floor(limit), 1),
          5_000,
        );

  const timeFilter = inboxConversationTimeFilter(scope);
  const where: Prisma.WhatsAppConversationWhereInput | undefined =
    timeFilter ? { lastMessageAt: timeFilter } : undefined;

  const conversations = await prisma.whatsAppConversation.findMany({
    where,
    orderBy: [
      { lastMessageAt: "desc" },
      { createdAt: "desc" },
    ],
    take: safeLimit ?? undefined,
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
          rawPayload: true,
        },
      },
    },
  });

  const templateBodies =
    await templateBodiesForMessages(
      conversations.flatMap(
        (conversation) =>
          conversation.messages,
      ),
    );

  return conversations.map((conversation) => {
    const lastMessage = conversation.messages[0];

    const lastMessageText =
      lastMessage
        ? resolveTemplateMessageText(
            lastMessage,
            templateBodies,
          )
        : null;

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
      source: conversation.source,
      lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
      lastMessage: lastMessage
        ? {
            text: lastMessageText,
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
        orderBy: [
          { messageTimestamp: "desc" },
          { createdAt: "desc" },
        ],
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
          rawPayload: true,
          messageTimestamp: true,
        },
      },
      tags: {
        include: { tag: true },
      },
    },
  });

  if (!conversation) return null;


  const chronologicalMessages =
    [...conversation.messages].reverse();

  const templateBodies =
    await templateBodiesForMessages(
      chronologicalMessages,
    );

  const resolvedMessages =
    chronologicalMessages.map((message) => {
      const {
        rawPayload,
        ...rest
      } = message;

      return {
        ...rest,
        text:
          resolveTemplateMessageText(
            message,
            templateBodies,
          ),
        messageTimestamp:
          message.messageTimestamp.toISOString(),
      };
    });

  const latestMessage =
    resolvedMessages.at(-1) ?? null;

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
          timestamp: latestMessage.messageTimestamp,
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
    messages: resolvedMessages,
    tags: conversation.tags.map(({ tag }) => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
    })),
  };
}
