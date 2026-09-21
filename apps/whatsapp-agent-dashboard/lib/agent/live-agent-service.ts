import {
  AgentMode,
  MessageActor,
  MessageDirection,
  MessageType,
  Prisma,
} from "@prisma/client";

import { prisma } from "../db/prisma";
import { captureDecisionLearningCandidate } from "../learning/learning-repository";
import { getOutboundMode } from "../meta/outbound-client";
import {
  dispatchOutboundMessage,
  queueOutboundMessage,
} from "../outbound/outbound-service";
import { getAgentRuntimePolicy } from "../observability/runtime-policy";
import {
  compactOperationalError,
  sanitizeOperationalValue,
} from "../observability/sanitize";
import { analyzeAndPersistConversation } from "./conversation-intelligence";

export type LiveAgentLifecycleResult = {
  messageId: string;
  conversationId: string;
  analyzed: boolean;
  queued: boolean;
  sent: boolean;
  handoff: boolean;
  skipped: boolean;
  failed: boolean;
  reason: string;
};

function booleanEnvironment(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (["1", "true", "yes", "on", "enabled"].includes(value)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(value)) return false;
  return fallback;
}

export function getLiveAgentPolicy() {
  const runtime = getAgentRuntimePolicy();
  const outboundMode = getOutboundMode();
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
  result: LiveAgentLifecycleResult,
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

export async function processInboundAgentLifecycle(input: {
  messageId: string;
}): Promise<LiveAgentLifecycleResult> {
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
      conversation: { select: { agentMode: true } },
    },
  });

  if (!message) {
    return {
      messageId: input.messageId,
      conversationId: "",
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
  };
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
    const policy = getLiveAgentPolicy();
    if (!policy.webhookAnalysisEnabled) {
      const result: LiveAgentLifecycleResult = {
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
      const result: LiveAgentLifecycleResult = {
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

    if (message.conversation.agentMode !== AgentMode.AI) {
      const result: LiveAgentLifecycleResult = {
        ...base,
        analyzed: false,
        queued: false,
        sent: false,
        handoff: false,
        skipped: true,
        failed: false,
        reason: `CONVERSATION_MODE_${message.conversation.agentMode}`,
      };
      await finishLifecycle(message.id, result);
      return result;
    }

    if (message.type !== MessageType.TEXT || !message.text?.trim()) {
      await markReviewRequired({
        messageId: message.id,
        conversationId: message.conversationId,
        reason: "UNSUPPORTED_MEDIA",
        messageType: message.type,
      });
      const result: LiveAgentLifecycleResult = {
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

    const intelligence = await analyzeAndPersistConversation({
      conversationId: message.conversationId,
      customerMessage: message.text,
      actorId: null,
    });
    const decision = intelligence.decision;

    await captureDecisionLearningCandidate({
      decision,
      userQuestion: message.text,
      sourceMessageId: message.id,
      actorId: null,
    });

    const livePolicy = getLiveAgentPolicy();
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
      const result: LiveAgentLifecycleResult = {
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

    const queued = await queueOutboundMessage({
      conversationId: message.conversationId,
      actor: MessageActor.AI,
      sentById: null,
      content: {
        kind: "text",
        text: decision.reply,
        replyToMetaMessageId: message.metaMessageId,
      },
      idempotencyKey: `agent-reply:${message.id}`,
    });

    let sent = false;
    let dispatchStatus: "QUEUED" | "SENT" | "FAILED" | null = null;
    if (queued.message?.id && livePolicy.immediateDispatchEnabled) {
      const dispatch = await dispatchOutboundMessage(queued.message.id);
      dispatchStatus = dispatch.status;
      sent = dispatch.status === "SENT" && dispatch.outboundSent;
    }

    const result: LiveAgentLifecycleResult = {
      ...base,
      analyzed: true,
      queued: queued.queued || queued.duplicate,
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
      outboundMessageId: queued.message?.id ?? null,
      dispatchStatus,
      intent: decision.intent,
      confidence: decision.confidence,
      knowledgeReferenceCount: decision.knowledgeReferences.length,
      model: decision.model,
      telemetry: decision.telemetry ?? null,
    });
    return result;
  } catch (error) {
    const reason = compactOperationalError(error);
    const result: LiveAgentLifecycleResult = {
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

export async function getLiveAgentStatus() {
  const policy = getLiveAgentPolicy();
  const [pendingReview, aiMode, recentLifecycle] = await prisma.$transaction([
    prisma.whatsAppConversation.count({
      where: { agentMode: AgentMode.REVIEW_REQUIRED },
    }),
    prisma.whatsAppConversation.count({ where: { agentMode: AgentMode.AI } }),
    prisma.webhookEvent.findMany({
      where: { eventType: "agent_inbound_lifecycle" },
      orderBy: { receivedAt: "desc" },
      take: 25,
      select: {
        processedAt: true,
        processingError: true,
        payload: true,
      },
    }),
  ]);

  const recent = recentLifecycle.reduce(
    (totals, event) => {
      const payload =
        event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
          ? (event.payload as Record<string, unknown>)
          : {};
      if (payload.analyzed === true) totals.analyzed += 1;
      if (payload.queued === true) totals.queued += 1;
      if (payload.sent === true) totals.sent += 1;
      if (payload.handoff === true) totals.handoffs += 1;
      if (payload.failed === true || event.processingError) totals.failed += 1;
      return totals;
    },
    { analyzed: 0, queued: 0, sent: 0, handoffs: 0, failed: 0 },
  );

  return {
    policy,
    conversations: { aiMode, pendingReview },
    recent,
    sampleSize: recentLifecycle.length,
    generatedAt: new Date().toISOString(),
  };
}
