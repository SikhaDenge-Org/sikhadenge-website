import {
  AgentMode,
  MessageActor,
  MessageDirection,
  MessageType,
  Prisma,
} from "@prisma/client";

import { prisma } from "../db/prisma";
import {
  getInstagramOutboundMode,
} from "../instagram/api-client";
import { sendInstagramConversationMessage } from "../instagram/outbound-service";
import { captureConversationFeedback } from "../learning/conversation-feedback";
import { captureDecisionLearningCandidate } from "../learning/learning-repository";
import {
  getMessengerOutboundMode,
} from "../messenger/api-client";
import { sendMessengerConversationMessage } from "../messenger/outbound-service";
import { getAgentRuntimePolicy } from "../observability/runtime-policy";
import {
  compactOperationalError,
  sanitizeOperationalValue,
} from "../observability/sanitize";
import { analyzeAndPersistConversation } from "./conversation-intelligence";

export type SocialAgentChannel = "instagram" | "messenger";

export type SocialAgentLifecycleResult = {
  messageId: string;
  conversationId: string;
  channel: SocialAgentChannel;
  analyzed: boolean;
  queued: boolean;
  sent: boolean;
  handoff: boolean;
  skipped: boolean;
  failed: boolean;
  reason: string;
};

const PLACEHOLDER_HUMAN_REASONS: Record<SocialAgentChannel, string> = {
  instagram: "Instagram conversation awaiting a counselor.",
  messenger: "Messenger conversation awaiting a counselor.",
};

function booleanEnvironment(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (["1", "true", "yes", "on", "enabled"].includes(value)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(value)) return false;
  return fallback;
}

export function getSocialAgentPolicy(channel: SocialAgentChannel) {
  const runtime = getAgentRuntimePolicy();
  const outboundMode =
    channel === "instagram"
      ? getInstagramOutboundMode()
      : getMessengerOutboundMode();
  const webhookAnalysisEnabled = booleanEnvironment(
    "AGENT_WEBHOOK_ANALYSIS_ENABLED",
    true,
  );
  const autoReplyEnabled = booleanEnvironment("AGENT_AUTO_REPLY_ENABLED", false);
  const immediateDispatchEnabled = booleanEnvironment(
    "AGENT_IMMEDIATE_DISPATCH_ENABLED",
    false,
  );

  return {
    channel,
    webhookAnalysisEnabled,
    autoReplyEnabled,
    immediateDispatchEnabled,
    runtimeEnabled: runtime.enabled,
    killSwitchActive: runtime.killSwitchActive,
    modelCallsEnabled: runtime.modelCallsEnabled,
    outboundMode,
    liveAutoReplyReady:
      webhookAnalysisEnabled &&
      autoReplyEnabled &&
      immediateDispatchEnabled &&
      runtime.enabled &&
      outboundMode === "live",
  };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(sanitizeOperationalValue(value)),
  ) as Prisma.InputJsonValue;
}

function isDuplicateKey(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function reserveLifecycle(messageId: string): Promise<boolean> {
  try {
    await prisma.webhookEvent.create({
      data: {
        eventKey: `agent-lifecycle:${messageId}`,
        eventType: "agent_inbound_lifecycle",
        payload: toJson({ messageId, reservedAt: new Date().toISOString() }),
        attemptCount: 1,
      },
    });
    return true;
  } catch (error) {
    if (isDuplicateKey(error)) return false;
    throw error;
  }
}

async function finishLifecycle(
  messageId: string,
  result: SocialAgentLifecycleResult,
  details?: Record<string, unknown>,
) {
  await prisma.webhookEvent.update({
    where: { eventKey: `agent-lifecycle:${messageId}` },
    data: {
      processedAt: new Date(),
      processingError: result.failed ? result.reason.slice(0, 1_000) : null,
      payload: toJson({
        ...result,
        ...(details ?? {}),
        completedAt: new Date().toISOString(),
      }),
    },
  });
}

async function markReviewRequired(input: {
  messageId: string;
  conversationId: string;
  reason: "UNSUPPORTED_MEDIA" | "AGENT_UNAVAILABLE";
  messageType?: MessageType;
}) {
  await prisma.$transaction(async (transaction) => {
    const conversation = await transaction.whatsAppConversation.findUnique({
      where: { id: input.conversationId },
      select: { id: true, agentMode: true },
    });
    if (!conversation || conversation.agentMode !== AgentMode.AI) return;

    await transaction.whatsAppConversation.update({
      where: { id: conversation.id },
      data: {
        agentMode: AgentMode.REVIEW_REQUIRED,
        humanTakeoverAt: new Date(),
        humanTakeoverReason: input.reason,
      },
    });
    await transaction.auditLog.create({
      data: {
        action:
          input.reason === "UNSUPPORTED_MEDIA"
            ? "AGENT_MEDIA_HANDOFF_REQUIRED"
            : "AGENT_RUNTIME_HANDOFF_REQUIRED",
        entityType: "WhatsAppConversation",
        entityId: conversation.id,
        after: toJson({
          sourceMessageId: input.messageId,
          messageType: input.messageType ?? null,
          agentMode: AgentMode.REVIEW_REQUIRED,
          handoffReason: input.reason,
        }),
      },
    });
  });
}

function isSupportedConversationText(type: MessageType, text: string | null): boolean {
  return (
    (type === MessageType.TEXT || type === MessageType.INTERACTIVE) &&
    Boolean(text?.trim())
  );
}

function sourceMatchesChannel(
  source: string | null,
  channel: SocialAgentChannel,
): boolean {
  return source?.trim().toLowerCase() === channel;
}

function canRecoverPlaceholderHumanMode(input: {
  channel: SocialAgentChannel;
  agentMode: AgentMode;
  humanTakeoverReason: string | null;
}): boolean {
  return (
    input.agentMode === AgentMode.HUMAN &&
    input.humanTakeoverReason === PLACEHOLDER_HUMAN_REASONS[input.channel]
  );
}

export async function processSocialInboundAgentLifecycle(input: {
  messageId: string;
  channel: SocialAgentChannel;
}): Promise<SocialAgentLifecycleResult> {
  const message = await prisma.whatsAppMessage.findUnique({
    where: { id: input.messageId },
    select: {
      id: true,
      metaMessageId: true,
      conversationId: true,
      direction: true,
      actor: true,
      type: true,
      text: true,
      status: true,
      conversation: {
        select: {
          source: true,
          agentMode: true,
          humanTakeoverReason: true,
        },
      },
    },
  });

  if (!message) {
    return {
      messageId: input.messageId,
      conversationId: "",
      channel: input.channel,
      analyzed: false,
      queued: false,
      sent: false,
      handoff: false,
      skipped: true,
      failed: false,
      reason: "INBOUND_MESSAGE_NOT_FOUND",
    };
  }

  const base = {
    messageId: message.id,
    conversationId: message.conversationId,
    channel: input.channel,
  };

  if (!sourceMatchesChannel(message.conversation.source, input.channel)) {
    return {
      ...base,
      analyzed: false,
      queued: false,
      sent: false,
      handoff: false,
      skipped: true,
      failed: false,
      reason: "CONVERSATION_CHANNEL_MISMATCH",
    };
  }

  let effectiveAgentMode = message.conversation.agentMode;
  if (
    canRecoverPlaceholderHumanMode({
      channel: input.channel,
      agentMode: effectiveAgentMode,
      humanTakeoverReason: message.conversation.humanTakeoverReason,
    })
  ) {
    await prisma.whatsAppConversation.update({
      where: { id: message.conversationId },
      data: {
        agentMode: AgentMode.AI,
        humanTakeoverAt: null,
        humanTakeoverReason: null,
      },
    });
    effectiveAgentMode = AgentMode.AI;
  }

  const reserved = await reserveLifecycle(message.id);
  if (!reserved) {
    return {
      ...base,
      analyzed: false,
      queued: false,
      sent: false,
      handoff: false,
      skipped: true,
      failed: false,
      reason: "DUPLICATE_AGENT_LIFECYCLE",
    };
  }

  try {
    const policy = getSocialAgentPolicy(input.channel);
    if (!policy.webhookAnalysisEnabled) {
      const result: SocialAgentLifecycleResult = {
        ...base,
        analyzed: false,
        queued: false,
        sent: false,
        handoff: false,
        skipped: true,
        failed: false,
        reason: "WEBHOOK_AGENT_ANALYSIS_DISABLED",
      };
      await finishLifecycle(message.id, result, { policy });
      return result;
    }

    if (
      message.direction !== MessageDirection.INBOUND ||
      message.actor !== MessageActor.CUSTOMER
    ) {
      const result: SocialAgentLifecycleResult = {
        ...base,
        analyzed: false,
        queued: false,
        sent: false,
        handoff: false,
        skipped: true,
        failed: false,
        reason: "MESSAGE_IS_NOT_CUSTOMER_INBOUND",
      };
      await finishLifecycle(message.id, result);
      return result;
    }

    if (effectiveAgentMode !== AgentMode.AI) {
      const result: SocialAgentLifecycleResult = {
        ...base,
        analyzed: false,
        queued: false,
        sent: false,
        handoff: false,
        skipped: true,
        failed: false,
        reason: `CONVERSATION_MODE_${effectiveAgentMode}`,
      };
      await finishLifecycle(message.id, result);
      return result;
    }

    if (!isSupportedConversationText(message.type, message.text)) {
      await markReviewRequired({
        messageId: message.id,
        conversationId: message.conversationId,
        reason: "UNSUPPORTED_MEDIA",
        messageType: message.type,
      });
      const result: SocialAgentLifecycleResult = {
        ...base,
        analyzed: false,
        queued: false,
        sent: false,
        handoff: true,
        skipped: false,
        failed: false,
        reason: "UNSUPPORTED_MEDIA",
      };
      await finishLifecycle(message.id, result);
      return result;
    }

    try {
      await captureConversationFeedback({
        sourceMessageId: message.id,
        userMessage: message.text!,
      });
    } catch (error) {
      console.warn(
        `[agent-learning-feedback:${input.channel}] ${compactOperationalError(error).slice(0, 300)}`,
      );
    }

    const intelligence = await analyzeAndPersistConversation({
      conversationId: message.conversationId,
      customerMessage: message.text!,
      actorId: null,
    });
    const decision = intelligence.decision;

    await captureDecisionLearningCandidate({
      decision,
      userQuestion: message.text!,
      sourceMessageId: message.id,
      actorId: null,
    });

    const livePolicy = getSocialAgentPolicy(input.channel);
    const shouldAutoReply =
      livePolicy.liveAutoReplyReady &&
      decision.shouldReply &&
      Boolean(decision.reply.trim()) &&
      !decision.requiresHuman &&
      decision.intent !== "OPT_OUT" &&
      intelligence.conversation.agentMode === AgentMode.AI;

    if (!shouldAutoReply) {
      const reason = decision.requiresHuman
        ? decision.handoffReason || "HUMAN_REVIEW_REQUIRED"
        : decision.intent === "OPT_OUT"
          ? "OPT_OUT_RECORDED_NO_AUTOREPLY"
          : livePolicy.liveAutoReplyReady
            ? "DECISION_NOT_SENDABLE"
            : "LIVE_AUTOREPLY_LOCKED";
      const result: SocialAgentLifecycleResult = {
        ...base,
        analyzed: true,
        queued: false,
        sent: false,
        handoff: decision.requiresHuman,
        skipped: !decision.requiresHuman,
        failed: false,
        reason,
      };
      await finishLifecycle(message.id, result, {
        intent: decision.intent,
        confidence: decision.confidence,
        requiresHuman: decision.requiresHuman,
        handoffReason: decision.handoffReason,
        knowledgeReferenceCount: decision.knowledgeReferences.length,
        model: decision.model,
        telemetry: decision.telemetry ?? null,
        policy: livePolicy,
      });
      return result;
    }

    const content = {
      kind: "text" as const,
      text: decision.reply,
      replyToMetaMessageId: message.metaMessageId,
    };
    const idempotencyKey = `agent-reply:${message.id}`;
    const outbound =
      input.channel === "instagram"
        ? await sendInstagramConversationMessage({
            conversationId: message.conversationId,
            actor: MessageActor.AI,
            sentById: null,
            content,
            idempotencyKey,
          })
        : await sendMessengerConversationMessage({
            conversationId: message.conversationId,
            actor: MessageActor.AI,
            sentById: null,
            content,
            idempotencyKey,
          });

    const sent = outbound.outboundSent;
    const dispatchStatus = outbound.dispatchStatus;
    const result: SocialAgentLifecycleResult = {
      ...base,
      analyzed: true,
      queued: outbound.queued || outbound.duplicate,
      sent,
      handoff: false,
      skipped: false,
      failed: dispatchStatus === "FAILED",
      reason:
        dispatchStatus === "FAILED"
          ? "AI_REPLY_DISPATCH_FAILED"
          : sent
            ? "AI_REPLY_SENT"
            : "AI_REPLY_QUEUED",
    };
    await finishLifecycle(message.id, result, {
      outboundMessageId: outbound.message?.id ?? null,
      dispatchStatus,
      dispatchMode: outbound.dispatchMode,
      dispatchError: outbound.dispatchError,
      intent: decision.intent,
      confidence: decision.confidence,
      knowledgeReferenceCount: decision.knowledgeReferences.length,
      model: decision.model,
      telemetry: decision.telemetry ?? null,
    });
    return result;
  } catch (error) {
    const reason = compactOperationalError(error);
    const result: SocialAgentLifecycleResult = {
      ...base,
      analyzed: false,
      queued: false,
      sent: false,
      handoff: true,
      skipped: false,
      failed: true,
      reason,
    };

    try {
      await markReviewRequired({
        messageId: message.id,
        conversationId: message.conversationId,
        reason: "AGENT_UNAVAILABLE",
        messageType: message.type,
      });
      await finishLifecycle(message.id, result, {
        sourceMessageStatus: message.status,
      });
    } catch {
      // Webhook ingestion must remain successful even if lifecycle logging fails.
    }
    return result;
  }
}
