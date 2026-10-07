import {
  AgentMode,
  LeadStage,
  MessageActor,
  MessageDirection,
  MessageType,
} from "@prisma/client";

import { prisma } from "../db/prisma";
import { normalizeWhatsAppWebhook } from "../meta/webhook-normalizer";
import {
  showWhatsAppTypingIndicator,
  waitForTypingDelay,
} from "../meta/typing-indicator";
import {
  getLiveAgentPolicy,
  processInboundAgentLifecycle,
  type LiveAgentLifecycleResult,
} from "./live-agent-service";
import {
  isOptOutKeyword,
  recordInboundConsent,
  checkSuppression,
  isAIHandlingAllowed,
  extractSignals,
  updateLeadFromSignals,
  extractCTWAReferral,
  attachAttributionToConversation,
} from "../sales-os";

export type WebhookAgentBridgeResult = {
  matched: number;
  analyzed: number;
  queued: number;
  sent: number;
  handoffs: number;
  skipped: number;
  failed: number;
};

export async function processWebhookAgentBridge(
  payload: unknown,
): Promise<WebhookAgentBridgeResult> {
  const events = normalizeWhatsAppWebhook(payload).filter(
    (event) => event.kind === "message",
  );
  const result: WebhookAgentBridgeResult = {
    matched: 0,
    analyzed: 0,
    queued: 0,
    sent: 0,
    handoffs: 0,
    skipped: 0,
    failed: 0,
  };

  for (const event of events) {
    if (event.kind !== "message") continue;
    const stored = await prisma.whatsAppMessage.findUnique({
      where: { metaMessageId: event.message.id },
      select: {
        id: true,
        text: true,
        direction: true,
        actor: true,
        type: true,
        conversation: {
          select: {
            id: true,
            agentMode: true,
            humanTakeoverAt: true,
            contactId: true,
            contact: {
              select: {
                id: true,
                phone: true,
              },
            },
            lead: { select: { id: true, stage: true } },
            _count: { select: { messages: true } },
          },
        },
      },
    });
    if (!stored) {
      result.skipped += 1;
      continue;
    }

    result.matched += 1;
    const messageText = stored.text?.trim() || "";
    const phone = stored.conversation.contact?.phone || "";
    const conversationId = stored.conversation.id;

    // --- GATE 1: CTWA Meta Ad Attribution ---
    try {
      const rawPayload = payload as Record<string, any> | undefined;
      const rawMsg = rawPayload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      const referral = rawMsg?.referral;
      const ctwPayload = extractCTWAReferral(referral);
      if (ctwPayload) {
        await attachAttributionToConversation({
          conversationId,
          referral: ctwPayload,
        });
      }
    } catch (refErr) {
      console.warn("[sales-os-bridge] CTWA attribution error:", refErr);
    }

    // --- GATE 2: Opt-Out / STOP Keyword Suppression ---
    if (messageText && isOptOutKeyword(messageText)) {
      if (phone) {
        await recordInboundConsent({
          phone,
          keywordMatched: messageText,
          source: "WHATSAPP_INBOUND",
        });
      }
      await prisma.whatsAppConversation.update({
        where: { id: conversationId },
        data: { agentMode: AgentMode.PAUSED },
      });
      result.skipped += 1;
      continue;
    }

    // --- GATE 3: Global Suppression Check ---
    if (phone) {
      const suppression = await checkSuppression(phone);
      if (suppression.isSuppressed) {
        result.skipped += 1;
        continue;
      }
    }

    // --- GATE 4: Human Takeover Gate ---
    const aiAllowed = await isAIHandlingAllowed(conversationId);
    if (!aiAllowed || stored.conversation.agentMode === AgentMode.HUMAN) {
      result.handoffs += 1;
      continue;
    }

    // --- GATE 5: Lead Qualification & CRM Scoring Update ---
    if (messageText && stored.conversation.contactId) {
      try {
        const signals = extractSignals(messageText);
        await updateLeadFromSignals({
          contactId: stored.conversation.contactId,
          conversationId,
          phone,
          signals,
        });
      } catch (sigErr) {
        console.warn("[sales-os-bridge] Qualification signals error:", sigErr);
      }
    }

    // --- AI Dispatch & Inbound Lifecycle ---
    let lifecycle: LiveAgentLifecycleResult;
    try {
      const isFirstMessageForNewLead =
        stored.conversation.lead?.stage === LeadStage.NEW &&
        stored.conversation._count.messages === 1;
      const canAutoActivate =
        isFirstMessageForNewLead &&
        !stored.conversation.humanTakeoverAt;

      let effectiveAgentMode = stored.conversation.agentMode;
      if (canAutoActivate && effectiveAgentMode !== AgentMode.AI) {
        await prisma.whatsAppConversation.update({
          where: { id: stored.conversation.id },
          data: { agentMode: AgentMode.AI },
        });
        effectiveAgentMode = AgentMode.AI;
      }

      const policy = getLiveAgentPolicy();
      const shouldShowTyping =
        policy.liveAutoReplyReady &&
        stored.direction === MessageDirection.INBOUND &&
        stored.actor === MessageActor.CUSTOMER &&
        stored.type === MessageType.TEXT &&
        Boolean(messageText) &&
        effectiveAgentMode === AgentMode.AI;

      if (shouldShowTyping) {
        let acknowledgedAt = Date.now();
        try {
          const indicator = await showWhatsAppTypingIndicator(event.message.id, stored.id);
          acknowledgedAt = indicator.acknowledgedAt;
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message.replace(/\s+/g, " ").slice(0, 300)
              : "Unknown Meta typing indicator error.";
          console.warn(`[whatsapp-typing] ${message}`);
          acknowledgedAt = Date.now();
        }

        await waitForTypingDelay(acknowledgedAt);
      }

      lifecycle = await processInboundAgentLifecycle({ messageId: stored.id });
    } catch {
      result.failed += 1;
      continue;
    }

    if (lifecycle.analyzed) result.analyzed += 1;
    if (lifecycle.queued) result.queued += 1;
    if (lifecycle.sent) result.sent += 1;
    if (lifecycle.handoff) result.handoffs += 1;
    if (lifecycle.skipped) result.skipped += 1;
    if (lifecycle.failed) result.failed += 1;
  }

  return result;
}
