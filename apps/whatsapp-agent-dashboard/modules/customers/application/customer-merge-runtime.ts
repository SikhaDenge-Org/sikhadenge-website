import { randomUUID } from "node:crypto";

import {
  evaluateIdentityMerge,
  reverseIdentityMerge,
  type IdentityEvidence,
  type IdentityMergeRecord,
} from "@/modules/customers/domain/identity-merge";
import {
  buildCustomer360,
  type Customer360Profile,
  type CustomerActivity,
  type CustomerChannelIdentity,
  type CustomerLeadSnapshot,
} from "@/modules/customers/application/customer-360";

export function createCustomerMergeRecord(input: {
  primaryCustomerId: string;
  mergedCustomerId: string;
  evidence: readonly IdentityEvidence[];
  actorId: string;
  at?: Date;
}): IdentityMergeRecord {
  if (!input.actorId.trim()) throw new Error("Merge actor is required.");
  const decision = evaluateIdentityMerge(
    input.primaryCustomerId,
    input.mergedCustomerId,
    input.evidence,
  );
  if (!decision.allowed) throw new Error(decision.reason);
  return {
    id: randomUUID(),
    primaryCustomerId: input.primaryCustomerId,
    mergedCustomerId: input.mergedCustomerId,
    evidence: [...decision.strongEvidence],
    mergedAt: input.at ?? new Date(),
    mergedBy: input.actorId,
  };
}

export function undoCustomerMerge(
  record: IdentityMergeRecord,
  actorId: string,
  at?: Date,
): IdentityMergeRecord {
  return reverseIdentityMerge(record, actorId, at);
}

export function projectCustomer360(input: {
  customerId: string;
  displayName?: string;
  identities: readonly CustomerChannelIdentity[];
  lead?: CustomerLeadSnapshot;
  activities: readonly CustomerActivity[];
  activeMergeRecords?: readonly IdentityMergeRecord[];
}): Customer360Profile & { mergedCustomerIds: readonly string[] } {
  const active = (input.activeMergeRecords ?? []).filter(
    (record) => record.primaryCustomerId === input.customerId && !record.reversedAt,
  );
  return {
    ...buildCustomer360(input),
    mergedCustomerIds: Array.from(new Set(active.map((record) => record.mergedCustomerId))),
  };
}
