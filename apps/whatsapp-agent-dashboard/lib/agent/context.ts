import { MessageActor } from "@prisma/client";

import { prisma } from "../db/prisma";
import { getAgentPolicy } from "./policy";
import type { AgentInput } from "./types";

export async function buildAgentInputFromConversation(input: {
  conversationId: string;
  customerMessage: string;
}): Promise<AgentInput | null> {
  const policy = getAgentPolicy();
  const conversation = await prisma.whatsAppConversation.findUnique({
    where: { id: input.conversationId },
    select: {
      id: true,
      detectedLanguage: true,
      aiSummary: true,
      contact: {
        select: {
          displayName: true,
          profileName: true,
          phone: true,
          city: true,
          language: true,
          consentStatus: true,
        },
      },
      lead: {
        select: {
          stage: true,
          temperature: true,
          score: true,
          occupation: true,
          experienceLevel: true,
          goal: true,
          interestedCourse: true,
          joiningTimeline: true,
          classAvailability: true,
          feeUnderstood: true,
          counselorRequested: true,
        },
      },
      messages: {
        where: {
          text: { not: null },
          actor: {
            in: [
              MessageActor.CUSTOMER,
              MessageActor.AI,
              MessageActor.COUNSELOR,
            ],
          },
        },
        select: {
          actor: true,
          text: true,
          messageTimestamp: true,
        },
        orderBy: { messageTimestamp: "desc" },
        take: policy.maximumHistoryMessages,
      },
    },
  });

  if (!conversation) return null;

  const history = conversation.messages
    .slice()
    .reverse()
    .flatMap((message) => {
      if (!message.text) return [];
      const role =
        message.actor === MessageActor.CUSTOMER
          ? "customer"
          : message.actor === MessageActor.COUNSELOR
            ? "counselor"
            : "assistant";

      return [
        {
          role,
          text: message.text,
          createdAt: message.messageTimestamp.toISOString(),
        } as const,
      ];
    });

  return {
    conversationId: conversation.id,
    customerMessage: input.customerMessage,
    languageHint:
      conversation.detectedLanguage ?? conversation.contact.language ?? null,
    conversationSummary: conversation.aiSummary,
    history,
    contact: {
      name:
        conversation.contact.displayName ?? conversation.contact.profileName ?? null,
      phone: conversation.contact.phone,
      city: conversation.contact.city,
      language: conversation.contact.language,
      consentStatus: conversation.contact.consentStatus,
    },
    lead: conversation.lead
      ? {
          stage: conversation.lead.stage,
          temperature: conversation.lead.temperature,
          score: conversation.lead.score,
          occupation: conversation.lead.occupation,
          experienceLevel: conversation.lead.experienceLevel,
          goal: conversation.lead.goal,
          interestedCourse: conversation.lead.interestedCourse,
          joiningTimeline: conversation.lead.joiningTimeline,
          classAvailability: conversation.lead.classAvailability,
          feeUnderstood: conversation.lead.feeUnderstood,
          counselorRequested: conversation.lead.counselorRequested,
        }
      : null,
  };
}
