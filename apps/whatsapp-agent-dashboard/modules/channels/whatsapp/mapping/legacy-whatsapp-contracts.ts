import type { ChannelConnectionId } from "@/modules/channels/core/contracts/channel";
import type { CustomerId } from "@/modules/customers/domain/customer";
import {
  assertValidMessageContent,
  conversationId,
  messageId,
  type AgentMode,
  type Conversation,
  type ConversationStatus,
  type Message,
  type MessageActor,
  type MessageDirection,
  type MessageKind,
  type MessageStatus,
} from "@/modules/inbox/domain/conversation";
import type { WorkspaceContext } from "@/modules/workspaces/domain/workspace";

export type LegacyWhatsAppConversationRecord = {
  id: string;
  status: string;
  agentMode: string;
  unreadCount: number;
  lastMessageAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type LegacyWhatsAppMessageRecord = {
  id: string;
  conversationId: string;
  metaMessageId?: string | null;
  direction: string;
  actor: string;
  type: string;
  status: string;
  text?: string | null;
  mediaUrl?: string | null;
  mediaId?: string | null;
  mediaMimeType?: string | null;
  mediaFileName?: string | null;
  replyToMessageId?: string | null;
  messageTimestamp: Date;
  createdAt: Date;
};

function mapConversationStatus(value: string): ConversationStatus {
  switch (value.toUpperCase()) {
    case "OPEN":
    case "PENDING":
    case "CLOSED":
    case "ARCHIVED":
      return value.toUpperCase() as ConversationStatus;
    default:
      throw new Error(`Unsupported legacy conversation status: ${value}`);
  }
}

function mapAgentMode(value: string): AgentMode {
  switch (value.toUpperCase()) {
    case "AI":
    case "HUMAN":
    case "PAUSED":
      return value.toUpperCase() as AgentMode;
    default:
      throw new Error(`Unsupported legacy agent mode: ${value}`);
  }
}

function mapDirection(value: string): MessageDirection {
  switch (value.toUpperCase()) {
    case "INBOUND":
    case "OUTBOUND":
      return value.toUpperCase() as MessageDirection;
    default:
      throw new Error(`Unsupported legacy message direction: ${value}`);
  }
}

function mapActor(value: string): MessageActor {
  switch (value.toUpperCase()) {
    case "CUSTOMER":
    case "AI":
    case "HUMAN":
    case "SYSTEM":
      return value.toUpperCase() as MessageActor;
    default:
      throw new Error(`Unsupported legacy message actor: ${value}`);
  }
}

function mapKind(value: string): MessageKind {
  switch (value.toUpperCase()) {
    case "TEXT":
    case "IMAGE":
    case "VIDEO":
    case "AUDIO":
    case "DOCUMENT":
    case "LOCATION":
    case "CONTACT":
    case "TEMPLATE":
      return value.toUpperCase() as MessageKind;
    default:
      return "UNKNOWN";
  }
}

function mapStatus(value: string): MessageStatus {
  switch (value.toUpperCase()) {
    case "RECEIVED":
    case "QUEUED":
    case "SENDING":
    case "SENT":
    case "DELIVERED":
    case "READ":
    case "FAILED":
      return value.toUpperCase() as MessageStatus;
    default:
      throw new Error(`Unsupported legacy message status: ${value}`);
  }
}

export function mapLegacyWhatsAppConversation(input: {
  context: WorkspaceContext;
  connectionId: ChannelConnectionId;
  customerId: CustomerId;
  record: LegacyWhatsAppConversationRecord;
}): Conversation {
  const { context, connectionId, customerId, record } = input;

  if (!Number.isInteger(record.unreadCount) || record.unreadCount < 0) {
    throw new Error("Legacy unreadCount must be a non-negative integer.");
  }

  return {
    id: conversationId(record.id),
    workspaceId: context.workspaceId,
    connectionId,
    channel: "WHATSAPP",
    customerId,
    externalConversationId: record.id,
    status: mapConversationStatus(record.status),
    agentMode: mapAgentMode(record.agentMode),
    unreadCount: record.unreadCount,
    lastInteractionAt: record.lastMessageAt ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function mapLegacyWhatsAppMessage(input: {
  context: WorkspaceContext;
  connectionId: ChannelConnectionId;
  record: LegacyWhatsAppMessageRecord;
}): Message {
  const { context, connectionId, record } = input;
  const kind = mapKind(record.type);

  const message: Message = {
    id: messageId(record.id),
    workspaceId: context.workspaceId,
    conversationId: conversationId(record.conversationId),
    connectionId,
    channel: "WHATSAPP",
    direction: mapDirection(record.direction),
    actor: mapActor(record.actor),
    kind,
    status: mapStatus(record.status),
    externalMessageId: record.metaMessageId ?? undefined,
    text: record.text ?? undefined,
    media:
      record.mediaUrl || record.mediaId
        ? {
            url: record.mediaUrl ?? undefined,
            externalMediaId: record.mediaId ?? undefined,
            mimeType: record.mediaMimeType ?? undefined,
            fileName: record.mediaFileName ?? undefined,
          }
        : undefined,
    replyToExternalMessageId: record.replyToMessageId ?? undefined,
    occurredAt: record.messageTimestamp,
    createdAt: record.createdAt,
  };

  assertValidMessageContent(message);
  return message;
}
