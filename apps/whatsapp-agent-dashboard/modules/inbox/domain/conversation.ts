import type {
  ChannelConnectionId,
  ChannelType,
} from "@/modules/channels/core/contracts/channel";
import type { CustomerId } from "@/modules/customers/domain/customer";
import type { WorkspaceId } from "@/modules/workspaces/domain/workspace";
import {
  asNonEmptyStringBrand,
  type Brand,
} from "@/shared/types/brand";

export type ConversationId = Brand<string, "ConversationId">;
export type MessageId = Brand<string, "MessageId">;
export type InteractionId = Brand<string, "InteractionId">;

export type ConversationStatus = "OPEN" | "PENDING" | "CLOSED" | "ARCHIVED";
export type AgentMode = "AI" | "HUMAN" | "PAUSED";
export type MessageDirection = "INBOUND" | "OUTBOUND";
export type MessageActor = "CUSTOMER" | "AI" | "HUMAN" | "SYSTEM";
export type MessageKind =
  | "TEXT"
  | "IMAGE"
  | "VIDEO"
  | "AUDIO"
  | "DOCUMENT"
  | "LOCATION"
  | "CONTACT"
  | "TEMPLATE"
  | "UNKNOWN";
export type MessageStatus =
  | "RECEIVED"
  | "QUEUED"
  | "SENDING"
  | "SENT"
  | "DELIVERED"
  | "READ"
  | "FAILED";

export type Conversation = {
  id: ConversationId;
  workspaceId: WorkspaceId;
  connectionId: ChannelConnectionId;
  channel: ChannelType;
  customerId: CustomerId;
  externalConversationId?: string;
  status: ConversationStatus;
  agentMode: AgentMode;
  unreadCount: number;
  lastInteractionAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type MessageMedia = {
  url?: string;
  externalMediaId?: string;
  mimeType?: string;
  fileName?: string;
  sizeBytes?: number;
};

export type Message = {
  id: MessageId;
  workspaceId: WorkspaceId;
  conversationId: ConversationId;
  connectionId: ChannelConnectionId;
  channel: ChannelType;
  direction: MessageDirection;
  actor: MessageActor;
  kind: MessageKind;
  status: MessageStatus;
  externalMessageId?: string;
  text?: string;
  media?: MessageMedia;
  replyToExternalMessageId?: string;
  occurredAt: Date;
  createdAt: Date;
};

export type InteractionKind =
  | "MESSAGE"
  | "COMMENT"
  | "MENTION"
  | "STORY_REPLY"
  | "REVIEW"
  | "NOTE"
  | "ASSIGNMENT"
  | "AUTOMATION";

export type Interaction = {
  id: InteractionId;
  workspaceId: WorkspaceId;
  conversationId: ConversationId;
  connectionId: ChannelConnectionId;
  channel: ChannelType;
  kind: InteractionKind;
  externalInteractionId?: string;
  occurredAt: Date;
  payload: Readonly<Record<string, unknown>>;
};

export function conversationId(value: string): ConversationId {
  return asNonEmptyStringBrand<"ConversationId">(value, "conversationId");
}

export function messageId(value: string): MessageId {
  return asNonEmptyStringBrand<"MessageId">(value, "messageId");
}

export function interactionId(value: string): InteractionId {
  return asNonEmptyStringBrand<"InteractionId">(value, "interactionId");
}

export function assertValidMessageContent(
  message: Pick<Message, "kind" | "text" | "media">,
): void {
  const hasText = Boolean(message.text?.trim());
  const hasMedia = Boolean(
    message.media?.url?.trim() || message.media?.externalMediaId?.trim(),
  );

  if (message.kind === "TEXT" && !hasText) {
    throw new Error("TEXT messages require non-empty text.");
  }

  if (
    ["IMAGE", "VIDEO", "AUDIO", "DOCUMENT"].includes(message.kind) &&
    !hasMedia
  ) {
    throw new Error(`${message.kind} messages require a media reference.`);
  }
}
