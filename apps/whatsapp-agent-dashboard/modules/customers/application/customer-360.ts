export type CustomerChannelIdentity = {
  channel: string;
  connectionId: string;
  externalUserId: string;
  username?: string;
  verified: boolean;
};

export type CustomerActivity = {
  id: string;
  type: string;
  channel?: string;
  occurredAt: Date;
  summary: string;
};

export type CustomerLeadSnapshot = {
  stage: string;
  score: number;
  ownerId?: string;
  nextFollowUpAt?: Date;
};

export type Customer360Profile = {
  customerId: string;
  displayName?: string;
  identities: readonly CustomerChannelIdentity[];
  lead?: CustomerLeadSnapshot;
  timeline: readonly CustomerActivity[];
};

export function buildCustomer360(input: {
  customerId: string;
  displayName?: string;
  identities: readonly CustomerChannelIdentity[];
  lead?: CustomerLeadSnapshot;
  activities: readonly CustomerActivity[];
}): Customer360Profile {
  if (!input.customerId.trim()) throw new Error("customerId is required.");

  const identityKeys = new Set<string>();
  const identities = input.identities.filter((identity) => {
    if (!identity.channel.trim() || !identity.connectionId.trim() || !identity.externalUserId.trim()) {
      return false;
    }
    const key = `${identity.channel}:${identity.connectionId}:${identity.externalUserId}`;
    if (identityKeys.has(key)) return false;
    identityKeys.add(key);
    return true;
  });

  const timeline = [...input.activities]
    .filter((activity) => activity.id.trim() && activity.summary.trim())
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  return {
    customerId: input.customerId,
    displayName: input.displayName?.trim() || undefined,
    identities,
    lead: input.lead,
    timeline,
  };
}
