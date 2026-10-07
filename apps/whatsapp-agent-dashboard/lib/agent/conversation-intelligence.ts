import {
  AgentMode,
  ConsentStatus,
  LeadStage,
  LeadTemperature,
  MessageActor,
  MessageDirection,
  Prisma,
} from "@prisma/client";

import { prisma } from "../db/prisma";
import {
  compactOperationalError,
  sanitizeOperationalValue,
} from "../observability/sanitize";
import { buildAgentInputFromConversation } from "./context";
import { applyLeadIntelligence, type LeadSnapshot } from "./lead-intelligence";
import { buildConversationMemory } from "./memory";
import { generateAgentDecision } from "./orchestrator";

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(sanitizeOperationalValue(value)),
  ) as Prisma.InputJsonValue;
}

async function resolveCustomerMessage(
  conversationId: string,
  supplied?: string | null,
): Promise<string | null> {
  const provided = supplied?.trim();
  if (provided) return provided.slice(0, 4_000);

  const latest = await prisma.whatsAppMessage.findFirst({
    where: {
      conversationId,
      direction: MessageDirection.INBOUND,
      actor: MessageActor.CUSTOMER,
      text: { not: null },
    },
    orderBy: { messageTimestamp: "desc" },
    select: { text: true },
  });
  return latest?.text?.trim().slice(0, 4_000) || null;
}

export async function analyzeAndPersistConversation(input: {
  conversationId: string;
  customerMessage?: string | null;
  actorId?: string | null;
}) {
  const customerMessage = await resolveCustomerMessage(
    input.conversationId,
    input.customerMessage,
  );
  if (!customerMessage) throw new Error("No customer text is available for analysis.");

  const agentInput = await buildAgentInputFromConversation({
    conversationId: input.conversationId,
    customerMessage,
  });
  if (!agentInput) throw new Error("Conversation not found.");

  const decision = await generateAgentDecision(agentInput);

  try {
    const persisted = await prisma.$transaction(async (transaction) => {
      const conversation = await transaction.whatsAppConversation.findUnique({
        where: { id: input.conversationId },
        select: {
          id: true,
          contactId: true,
          agentMode: true,
          aiSummary: true,
          currentIntent: true,
          detectedLanguage: true,
          aiConfidence: true,
          lead: {
            select: {
              id: true,
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
              qualifiedAt: true,
            },
          },
        },
      });
      if (!conversation) throw new Error("Conversation not found during persistence.");

      const baseline: LeadSnapshot = conversation.lead
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
        : {
            stage: LeadStage.NEW,
            temperature: LeadTemperature.COLD,
            score: 0,
            occupation: null,
            experienceLevel: null,
            goal: null,
            interestedCourse: null,
            joiningTimeline: null,
            classAvailability: null,
            feeUnderstood: false,
            counselorRequested: false,
          };

      const leadUpdates = {
        ...decision.leadUpdates,
        counselorRequested:
          decision.handoffReason === "CUSTOMER_REQUESTED_HUMAN"
            ? true
            : decision.leadUpdates.counselorRequested,
      };
      const lead = applyLeadIntelligence(baseline, leadUpdates);

      const memory = buildConversationMemory({
        agentInput: {
          ...agentInput,
          lead: {
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
          },
        },
        decision,
        previousSummary: conversation.aiSummary,
      });

      const nextMode =
        decision.requiresHuman && conversation.agentMode === AgentMode.AI
          ? AgentMode.REVIEW_REQUIRED
          : conversation.agentMode;

      const updatedConversation = await transaction.whatsAppConversation.update({
        where: { id: conversation.id },
        data: {
          currentIntent: decision.intent,
          detectedLanguage: decision.language,
          aiConfidence: decision.confidence,
          aiSummary: memory,
          agentMode: nextMode,
          humanTakeoverReason: decision.requiresHuman
            ? decision.handoffReason
            : conversation.agentMode === AgentMode.REVIEW_REQUIRED
              ? null
              : undefined,
        },
        select: {
          id: true,
          currentIntent: true,
          detectedLanguage: true,
          aiConfidence: true,
          aiSummary: true,
          agentMode: true,
          humanTakeoverReason: true,
        },
      });

      const leadData = {
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
        qualifiedAt:
          lead.qualifiedAt ?? conversation.lead?.qualifiedAt ?? undefined,
      };

      const updatedLead = conversation.lead
        ? await transaction.lead.update({
            where: { id: conversation.lead.id },
            data: leadData,
          })
        : await transaction.lead.create({
            data: {
              contactId: conversation.contactId,
              conversationId: conversation.id,
              ...leadData,
            },
          });

      if (decision.intent === "OPT_OUT") {
        await transaction.whatsAppContact.update({
          where: { id: conversation.contactId },
          data: {
            consentStatus: ConsentStatus.OPTED_OUT,
            optedOutAt: new Date(),
          },
        });
      }

      await transaction.auditLog.create({
        data: {
          actorId: input.actorId ?? null,
          action: "AGENT_CONVERSATION_ANALYZED",
          entityType: "WhatsAppConversation",
          entityId: conversation.id,
          before: toJson({
            currentIntent: conversation.currentIntent,
            detectedLanguage: conversation.detectedLanguage,
            aiConfidence: conversation.aiConfidence,
            agentMode: conversation.agentMode,
            leadStage: baseline.stage,
            leadScore: baseline.score,
          }),
          after: toJson({
            currentIntent: updatedConversation.currentIntent,
            detectedLanguage: updatedConversation.detectedLanguage,
            aiConfidence: updatedConversation.aiConfidence,
            agentMode: updatedConversation.agentMode,
            requiresHuman: decision.requiresHuman,
            handoffReason: decision.handoffReason,
            model: decision.model,
            telemetry: decision.telemetry ?? null,
            safety: {
              promptInjectionDetected: decision.safety.promptInjectionDetected,
              sensitiveDataDetected: decision.safety.sensitiveDataDetected,
            },
            leadStage: updatedLead.stage,
            leadTemperature: updatedLead.temperature,
            leadScore: updatedLead.score,
            knowledgeReferenceCount: decision.knowledgeReferences.length,
            outboundSent: false,
          }),
        },
      });

      return {
        conversation: updatedConversation,
        lead: updatedLead,
        memory,
      };
    });

    return {
      decision,
      ...persisted,
      outboundSent: false,
    };
  } catch (error) {
    throw new Error(
      `Agent intelligence persistence failed: ${compactOperationalError(error)}`,
    );
  }
}
