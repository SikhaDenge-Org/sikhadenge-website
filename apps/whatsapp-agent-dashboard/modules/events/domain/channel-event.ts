import type {
  ChannelConnectionId,
  ChannelType,
} from "@/modules/channels/core/contracts/channel";
import type { WorkspaceId } from "@/modules/workspaces/domain/workspace";
import {
  asNonEmptyStringBrand,
  type Brand,
} from "@/shared/types/brand";

export type ChannelEventId = Brand<string, "ChannelEventId">;
export type RawChannelEventId = Brand<string, "RawChannelEventId">;

export type ChannelEventType =
  | "MESSAGE_RECEIVED"
  | "MESSAGE_SENT"
  | "MESSAGE_DELIVERED"
  | "MESSAGE_READ"
  | "MESSAGE_FAILED"
  | "COMMENT_CREATED"
  | "COMMENT_REPLIED"
  | "PRIVATE_REPLY_SENT"
  | "STORY_REPLY_RECEIVED"
  | "MENTION_CREATED"
  | "REVIEW_CREATED"
  | "REVIEW_UPDATED"
  | "CONTACT_UPDATED"
  | "CHANNEL_CONNECTED"
  | "CHANNEL_DISCONNECTED"
  | "TOKEN_EXPIRING"
  | "TOKEN_REVOKED";

export type ExternalIdentityReference = {
  externalUserId: string;
  username?: string;
};

export type ExternalConversationReference = {
  externalConversationId?: string;
  externalThreadId?: string;
};

export type ExternalInteractionReference = {
  externalInteractionId: string;
  parentExternalInteractionId?: string;
};

export type ChannelEvent<
  TType extends ChannelEventType = ChannelEventType,
  TPayload = Readonly<Record<string, unknown>>,
> = {
  id: ChannelEventId;
  workspaceId: WorkspaceId;
  connectionId: ChannelConnectionId;
  channel: ChannelType;
  type: TType;
  externalEventId: string;
  occurredAt: Date;
  receivedAt: Date;
  actorIdentity?: ExternalIdentityReference;
  conversationReference?: ExternalConversationReference;
  interactionReference?: ExternalInteractionReference;
  payload: TPayload;
  rawEventId: RawChannelEventId;
  schemaVersion: number;
};

export type CreateChannelEventInput<
  TType extends ChannelEventType,
  TPayload,
> = Omit<ChannelEvent<TType, TPayload>, "id"> & {
  id: string;
};

export function channelEventId(value: string): ChannelEventId {
  return asNonEmptyStringBrand<"ChannelEventId">(value, "channelEventId");
}

export function rawChannelEventId(value: string): RawChannelEventId {
  return asNonEmptyStringBrand<"RawChannelEventId">(
    value,
    "rawChannelEventId",
  );
}

export function channelEventKey(
  event: Pick<
    ChannelEvent,
    "workspaceId" | "connectionId" | "type" | "externalEventId"
  >,
): string {
  const externalEventId = event.externalEventId.trim();

  if (!externalEventId) {
    throw new Error("externalEventId must be a non-empty string.");
  }

  return [
    event.workspaceId,
    event.connectionId,
    event.type,
    encodeURIComponent(externalEventId),
  ].join(":");
}

export function createChannelEvent<
  TType extends ChannelEventType,
  TPayload,
>(input: CreateChannelEventInput<TType, TPayload>): ChannelEvent<TType, TPayload> {
  if (!Number.isInteger(input.schemaVersion) || input.schemaVersion < 1) {
    throw new Error("schemaVersion must be a positive integer.");
  }

  if (input.receivedAt.getTime() < input.occurredAt.getTime()) {
    throw new Error("receivedAt cannot be earlier than occurredAt.");
  }

  const event: ChannelEvent<TType, TPayload> = {
    ...input,
    id: channelEventId(input.id),
    externalEventId: input.externalEventId.trim(),
  };

  channelEventKey(event);
  return event;
}
