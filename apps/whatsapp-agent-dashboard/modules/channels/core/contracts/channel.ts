import {
  asNonEmptyStringBrand,
  type Brand,
} from "@/shared/types/brand";
import type { WorkspaceId } from "@/modules/workspaces/domain/workspace";

export type ChannelConnectionId = Brand<string, "ChannelConnectionId">;

export const CHANNEL_TYPES = [
  "WHATSAPP",
  "EMAIL",
  "INSTAGRAM",
  "MESSENGER",
  "FACEBOOK",
  "TELEGRAM",
  "LINKEDIN",
  "X",
  "YOUTUBE",
  "GOOGLE_BUSINESS",
  "THREADS",
] as const;

export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const CHANNEL_CAPABILITIES = [
  "WEBHOOK_VERIFY",
  "INBOUND_MESSAGE",
  "OUTBOUND_TEXT",
  "OUTBOUND_MEDIA",
  "DELIVERY_STATUS",
  "READ_STATUS",
  "COMMENT_EVENTS",
  "PUBLIC_COMMENT_REPLY",
  "PRIVATE_COMMENT_REPLY",
  "STORY_REPLY",
  "MENTION_EVENTS",
] as const;

export type ChannelCapability = (typeof CHANNEL_CAPABILITIES)[number];

export const CHANNEL_CONNECTION_STATUSES = [
  "PENDING",
  "CONNECTED",
  "DEGRADED",
  "EXPIRED",
  "REVOKED",
  "DISCONNECTED",
] as const;

export type ChannelConnectionStatus =
  (typeof CHANNEL_CONNECTION_STATUSES)[number];

export type ChannelCapabilities = Readonly<
  Record<ChannelCapability, boolean>
>;

export type ChannelConnection = {
  id: ChannelConnectionId;
  workspaceId: WorkspaceId;
  channel: ChannelType;
  externalAccountId: string;
  displayName?: string;
  status: ChannelConnectionStatus;
  capabilities: ChannelCapabilities;
};

export function channelConnectionId(value: string): ChannelConnectionId {
  return asNonEmptyStringBrand<"ChannelConnectionId">(
    value,
    "channelConnectionId",
  );
}

export function isChannelType(value: string): value is ChannelType {
  return CHANNEL_TYPES.includes(value as ChannelType);
}

export function isChannelCapability(value: string): value is ChannelCapability {
  return CHANNEL_CAPABILITIES.includes(value as ChannelCapability);
}

export function isChannelConnectionStatus(
  value: string,
): value is ChannelConnectionStatus {
  return CHANNEL_CONNECTION_STATUSES.includes(
    value as ChannelConnectionStatus,
  );
}

export function supportsCapability(
  connection: Pick<ChannelConnection, "capabilities">,
  capability: ChannelCapability,
): boolean {
  return connection.capabilities[capability] === true;
}

export function emptyChannelCapabilities(): ChannelCapabilities {
  return {
    WEBHOOK_VERIFY: false,
    INBOUND_MESSAGE: false,
    OUTBOUND_TEXT: false,
    OUTBOUND_MEDIA: false,
    DELIVERY_STATUS: false,
    READ_STATUS: false,
    COMMENT_EVENTS: false,
    PUBLIC_COMMENT_REPLY: false,
    PRIVATE_COMMENT_REPLY: false,
    STORY_REPLY: false,
    MENTION_EVENTS: false,
  };
}
