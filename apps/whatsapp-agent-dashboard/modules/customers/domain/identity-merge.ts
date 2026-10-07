export type IdentityEvidenceType =
  | "VERIFIED_PHONE"
  | "VERIFIED_EMAIL"
  | "PLATFORM_ACCOUNT_LINK"
  | "CUSTOMER_CONFIRMED"
  | "DISPLAY_NAME"
  | "USERNAME"
  | "INFERRED";

export type IdentityEvidence = {
  type: IdentityEvidenceType;
  value: string;
  observedAt: Date;
  source: string;
};

const STRONG_EVIDENCE = new Set<IdentityEvidenceType>([
  "VERIFIED_PHONE",
  "VERIFIED_EMAIL",
  "PLATFORM_ACCOUNT_LINK",
  "CUSTOMER_CONFIRMED",
]);

export type IdentityMergeDecision =
  | { allowed: true; strongEvidence: readonly IdentityEvidence[] }
  | { allowed: false; reason: string };

export function evaluateIdentityMerge(
  leftCustomerId: string,
  rightCustomerId: string,
  evidence: readonly IdentityEvidence[],
): IdentityMergeDecision {
  if (!leftCustomerId.trim() || !rightCustomerId.trim()) {
    return { allowed: false, reason: "Both customer ids are required." };
  }
  if (leftCustomerId === rightCustomerId) {
    return { allowed: false, reason: "A customer cannot be merged with itself." };
  }
  const strongEvidence = evidence.filter(
    (item) => STRONG_EVIDENCE.has(item.type) && item.value.trim() && item.source.trim(),
  );
  if (strongEvidence.length === 0) {
    return { allowed: false, reason: "Merge requires verified or customer-confirmed identity evidence." };
  }
  return { allowed: true, strongEvidence };
}

export type IdentityMergeRecord = {
  id: string;
  primaryCustomerId: string;
  mergedCustomerId: string;
  evidence: readonly IdentityEvidence[];
  mergedAt: Date;
  mergedBy: string;
  reversedAt?: Date;
  reversedBy?: string;
};

export function reverseIdentityMerge(
  record: IdentityMergeRecord,
  actorId: string,
  at = new Date(),
): IdentityMergeRecord {
  if (record.reversedAt) throw new Error("Identity merge is already reversed.");
  if (!actorId.trim()) throw new Error("Reversal actor is required.");
  return { ...record, reversedAt: at, reversedBy: actorId };
}
