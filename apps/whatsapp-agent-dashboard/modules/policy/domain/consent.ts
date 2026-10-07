import type {
  ChannelConnectionId,
  ChannelType,
} from "@/modules/channels/core/contracts/channel";
import type { CustomerId } from "@/modules/customers/domain/customer";
import type { WorkspaceId } from "@/modules/workspaces/domain/workspace";

export type ConsentPurpose = "SERVICE" | "TRANSACTIONAL" | "MARKETING";
export type ConsentState = "UNKNOWN" | "GRANTED" | "REVOKED";

export type CustomerConsent = {
  workspaceId: WorkspaceId;
  customerId: CustomerId;
  channel: ChannelType;
  purpose: ConsentPurpose;
  state: ConsentState;
  source: string;
  changedAt: Date;
};

export type SuppressionReason =
  | "CUSTOMER_OPT_OUT"
  | "COMPLAINT"
  | "LEGAL"
  | "BOUNCE"
  | "ABUSE"
  | "ADMIN"
  | "OTHER";

export type CustomerSuppression = {
  id: string;
  workspaceId: WorkspaceId;
  customerId?: CustomerId;
  connectionId?: ChannelConnectionId;
  channel?: ChannelType;
  purposes: readonly (ConsentPurpose | "ALL")[];
  reason: SuppressionReason;
  startsAt: Date;
  expiresAt?: Date;
  revokedAt?: Date;
};

export type OutboundConsentContext = {
  workspaceId: WorkspaceId;
  customerId: CustomerId;
  connectionId: ChannelConnectionId;
  channel: ChannelType;
  purpose: ConsentPurpose;
  now?: Date;
};

export type ConsentDecision =
  | { allowed: true }
  | {
      allowed: false;
      code: "SUPPRESSED" | "CONSENT_REQUIRED" | "CONSENT_REVOKED";
      reason: string;
    };

function isSuppressionActive(
  suppression: CustomerSuppression,
  input: OutboundConsentContext,
  now: Date,
): boolean {
  if (suppression.workspaceId !== input.workspaceId) return false;
  if (suppression.revokedAt && suppression.revokedAt <= now) return false;
  if (suppression.startsAt > now) return false;
  if (suppression.expiresAt && suppression.expiresAt <= now) return false;
  if (suppression.customerId && suppression.customerId !== input.customerId) {
    return false;
  }
  if (
    suppression.connectionId &&
    suppression.connectionId !== input.connectionId
  ) {
    return false;
  }
  if (suppression.channel && suppression.channel !== input.channel) {
    return false;
  }

  return suppression.purposes.some(
    (purpose) => purpose === "ALL" || purpose === input.purpose,
  );
}

export function evaluateOutboundConsent(input: {
  context: OutboundConsentContext;
  consents: readonly CustomerConsent[];
  suppressions: readonly CustomerSuppression[];
}): ConsentDecision {
  const now = input.context.now ?? new Date();
  const activeSuppression = input.suppressions.find((suppression) =>
    isSuppressionActive(suppression, input.context, now),
  );

  if (activeSuppression) {
    return {
      allowed: false,
      code: "SUPPRESSED",
      reason: `Outbound action is suppressed: ${activeSuppression.reason}.`,
    };
  }

  const matchingConsents = input.consents
    .filter(
      (consent) =>
        consent.workspaceId === input.context.workspaceId &&
        consent.customerId === input.context.customerId &&
        consent.channel === input.context.channel &&
        consent.purpose === input.context.purpose,
    )
    .sort((left, right) => right.changedAt.getTime() - left.changedAt.getTime());
  const latest = matchingConsents[0];

  if (latest?.state === "REVOKED") {
    return {
      allowed: false,
      code: "CONSENT_REVOKED",
      reason: `Consent is revoked for ${input.context.purpose.toLowerCase()} messages.`,
    };
  }

  if (
    input.context.purpose === "MARKETING" &&
    latest?.state !== "GRANTED"
  ) {
    return {
      allowed: false,
      code: "CONSENT_REQUIRED",
      reason: "Affirmative marketing consent is required.",
    };
  }

  return { allowed: true };
}

export class ConsentPolicyError extends Error {
  readonly code: Exclude<ConsentDecision, { allowed: true }>["code"];

  constructor(decision: Exclude<ConsentDecision, { allowed: true }>) {
    super(decision.reason);
    this.name = "ConsentPolicyError";
    this.code = decision.code;
  }
}

export function assertOutboundConsent(
  input: Parameters<typeof evaluateOutboundConsent>[0],
): void {
  const decision = evaluateOutboundConsent(input);
  if (!decision.allowed) throw new ConsentPolicyError(decision);
}
