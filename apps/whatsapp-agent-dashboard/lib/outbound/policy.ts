import {
  AgentMode,
  ConsentStatus,
  ConversationStatus,
  MessageActor,
  MessageType,
  TemplateStatus,
} from "@prisma/client";

import type { OutboundContent, OutboundPolicyDecision } from "./types";

export type OutboundPolicyContext = {
  actor: MessageActor;
  agentMode: AgentMode;
  conversationStatus: ConversationStatus;
  consentStatus: ConsentStatus;
  serviceWindowExpiresAt: Date | null;
  templateStatus?: TemplateStatus | null;
};

export function isServiceWindowOpen(
  serviceWindowExpiresAt: Date | null,
  now = new Date(),
): boolean {
  return Boolean(serviceWindowExpiresAt && serviceWindowExpiresAt.getTime() > now.getTime());
}

function messageTypeFor(content: OutboundContent): MessageType {
  if (content.kind === "template") return MessageType.TEMPLATE;
  if (content.kind === "text") return MessageType.TEXT;
  if (content.mediaType === "image") return MessageType.IMAGE;
  if (content.mediaType === "document") return MessageType.DOCUMENT;
  if (content.mediaType === "video") return MessageType.VIDEO;
  return MessageType.AUDIO;
}

export function evaluateOutboundPolicy(input: {
  context: OutboundPolicyContext;
  content: OutboundContent;
  now?: Date;
}): OutboundPolicyDecision {
  const now = input.now ?? new Date();
  const serviceWindowOpen = isServiceWindowOpen(
    input.context.serviceWindowExpiresAt,
    now,
  );
  const messageType = messageTypeFor(input.content);

  if (input.context.consentStatus === ConsentStatus.OPTED_OUT) {
    return {
      allowed: false,
      reason: "CONTACT_OPTED_OUT",
      messageType,
      serviceWindowOpen,
    };
  }

  if (
    input.context.conversationStatus === ConversationStatus.SPAM ||
    input.context.conversationStatus === ConversationStatus.CLOSED
  ) {
    return {
      allowed: false,
      reason: "CONVERSATION_NOT_SENDABLE",
      messageType,
      serviceWindowOpen,
    };
  }

  if (input.context.agentMode === AgentMode.PAUSED) {
    return {
      allowed: false,
      reason: "CONVERSATION_PAUSED",
      messageType,
      serviceWindowOpen,
    };
  }

  if (
    input.context.actor === MessageActor.AI &&
    input.context.agentMode !== AgentMode.AI
  ) {
    return {
      allowed: false,
      reason: "AI_MODE_NOT_ACTIVE",
      messageType,
      serviceWindowOpen,
    };
  }

  if (input.content.kind === "text") {
    if (!input.content.text.trim()) {
      return {
        allowed: false,
        reason: "EMPTY_TEXT",
        messageType,
        serviceWindowOpen,
      };
    }
    if (!serviceWindowOpen) {
      return {
        allowed: false,
        reason: "TEMPLATE_REQUIRED_OUTSIDE_SERVICE_WINDOW",
        messageType,
        serviceWindowOpen,
      };
    }
  }

  if (input.content.kind === "media" && !serviceWindowOpen) {
    return {
      allowed: false,
      reason: "TEMPLATE_REQUIRED_OUTSIDE_SERVICE_WINDOW",
      messageType,
      serviceWindowOpen,
    };
  }

  if (
    input.content.kind === "template" &&
    input.context.templateStatus !== TemplateStatus.APPROVED
  ) {
    return {
      allowed: false,
      reason: "TEMPLATE_NOT_APPROVED",
      messageType,
      serviceWindowOpen,
    };
  }

  return {
    allowed: true,
    reason: null,
    messageType,
    serviceWindowOpen,
  };
}
