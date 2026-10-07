import type {
  ChannelConnectionId,
  ChannelType,
} from "@/modules/channels/core/contracts/channel";
import type { WorkspaceId } from "@/modules/workspaces/domain/workspace";
import {
  asNonEmptyStringBrand,
  type Brand,
} from "@/shared/types/brand";

export type CustomerId = Brand<string, "CustomerId">;
export type CustomerIdentityId = Brand<string, "CustomerIdentityId">;

export type Customer = {
  id: CustomerId;
  workspaceId: WorkspaceId;
  displayName?: string;
  email?: string;
  phone?: string;
  locale?: string;
  timezone?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ExternalIdentity = {
  id: CustomerIdentityId;
  workspaceId: WorkspaceId;
  customerId: CustomerId;
  connectionId: ChannelConnectionId;
  channel: ChannelType;
  externalUserId: string;
  username?: string;
  displayName?: string;
  verifiedAt?: Date;
};

export function customerId(value: string): CustomerId {
  return asNonEmptyStringBrand<"CustomerId">(value, "customerId");
}

export function customerIdentityId(value: string): CustomerIdentityId {
  return asNonEmptyStringBrand<"CustomerIdentityId">(
    value,
    "customerIdentityId",
  );
}

export function externalIdentityKey(
  identity: Pick<
    ExternalIdentity,
    "workspaceId" | "connectionId" | "channel" | "externalUserId"
  >,
): string {
  const externalUserId = identity.externalUserId.trim();

  if (!externalUserId) {
    throw new Error("externalUserId must be a non-empty string.");
  }

  return [
    identity.workspaceId,
    identity.connectionId,
    identity.channel,
    encodeURIComponent(externalUserId),
  ].join(":");
}
