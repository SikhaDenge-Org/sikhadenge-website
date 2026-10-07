import type { EmailRuntimeMode } from "../domain/contracts";

export const EMAIL_DELIVERABILITY_HARD_BOUNCE_BLOCK_PCT = 5;
export const EMAIL_DELIVERABILITY_COMPLAINT_BLOCK_PCT = 0.1;
export const EMAIL_DELIVERABILITY_DEFAULT_MAX_AGE_MINUTES = 1_440;

export type EmailDeliverabilitySnapshot = {
  checkedAt: string | null;
  spfAligned: boolean | null;
  dkimAligned: boolean | null;
  dmarcAligned: boolean | null;
  hardBounceRatePct: number | null;
  complaintRatePct: number | null;
  complaintTelemetryQualified: boolean | null;
};

export type EmailDeliverabilityDecision = {
  enforced: boolean;
  allowed: boolean;
  reasons: readonly string[];
  snapshot: EmailDeliverabilitySnapshot;
};

function unknownSnapshot(): EmailDeliverabilitySnapshot {
  return {
    checkedAt: null,
    spfAligned: null,
    dkimAligned: null,
    dmarcAligned: null,
    hardBounceRatePct: null,
    complaintRatePct: null,
    complaintTelemetryQualified: null,
  };
}

function maxAgeMinutes(env: NodeJS.ProcessEnv): number {
  const parsed = Number(env.EMAIL_DELIVERABILITY_EVIDENCE_MAX_AGE_MINUTES);
  return Number.isFinite(parsed)
    ? Math.min(10_080, Math.max(15, Math.floor(parsed)))
    : EMAIL_DELIVERABILITY_DEFAULT_MAX_AGE_MINUTES;
}

function evidenceIsFresh(checkedAt: string | null, now: Date, maxAge: number): boolean {
  if (!checkedAt) return false;
  const checked = new Date(checkedAt);
  if (Number.isNaN(checked.getTime()) || checked.getTime() > now.getTime()) return false;
  return now.getTime() - checked.getTime() <= maxAge * 60_000;
}

export function evaluateEmailDeliverabilityGuardrails(input: {
  mode: EmailRuntimeMode;
  snapshot?: EmailDeliverabilitySnapshot | null;
  env?: NodeJS.ProcessEnv;
  now?: Date;
}): EmailDeliverabilityDecision {
  const snapshot = input.snapshot ?? unknownSnapshot();
  const enforced = input.mode === "LIMITED_COHORT" || input.mode === "LIVE";
  if (!enforced) return { enforced: false, allowed: true, reasons: Object.freeze([]), snapshot };

  const reasons: string[] = [];
  const now = input.now ?? new Date();
  const ageLimit = maxAgeMinutes(input.env ?? process.env);
  if (!snapshot.checkedAt) {
    reasons.push("Persisted deliverability evidence is missing.");
  } else if (!evidenceIsFresh(snapshot.checkedAt, now, ageLimit)) {
    reasons.push(`Persisted deliverability evidence is stale or invalid; maximum age is ${ageLimit} minutes.`);
  }

  if (snapshot.spfAligned !== true) reasons.push("SPF provider authorization is not positively qualified.");
  if (snapshot.dkimAligned !== true) reasons.push("DKIM sender-domain authentication is not positively qualified.");
  if (snapshot.dmarcAligned !== true) reasons.push("DMARC sender-domain policy is not positively qualified.");

  if (snapshot.hardBounceRatePct == null) {
    reasons.push("Hard-bounce rate telemetry is missing or invalid.");
  } else if (snapshot.hardBounceRatePct >= EMAIL_DELIVERABILITY_HARD_BOUNCE_BLOCK_PCT) {
    reasons.push(`Hard-bounce rate ${snapshot.hardBounceRatePct}% is at or above the ${EMAIL_DELIVERABILITY_HARD_BOUNCE_BLOCK_PCT}% safety ceiling.`);
  }

  if (snapshot.complaintTelemetryQualified !== true) {
    reasons.push("Authoritative complaint/spam telemetry source is not qualified.");
  }
  if (snapshot.complaintRatePct == null) {
    reasons.push("Complaint/spam rate telemetry is missing or invalid.");
  } else if (snapshot.complaintRatePct >= EMAIL_DELIVERABILITY_COMPLAINT_BLOCK_PCT) {
    reasons.push(`Complaint/spam rate ${snapshot.complaintRatePct}% is at or above the ${EMAIL_DELIVERABILITY_COMPLAINT_BLOCK_PCT}% safety ceiling.`);
  }

  return {
    enforced: true,
    allowed: reasons.length === 0,
    reasons: Object.freeze(reasons),
    snapshot,
  };
}

export function assertEmailDeliverabilityGuardrails(input: {
  mode: EmailRuntimeMode;
  snapshot?: EmailDeliverabilitySnapshot | null;
  env?: NodeJS.ProcessEnv;
  now?: Date;
}): EmailDeliverabilityDecision {
  const decision = evaluateEmailDeliverabilityGuardrails(input);
  if (!decision.allowed) {
    throw new Error(`Email deliverability guard blocked scaled external delivery: ${decision.reasons.join(" ")}`);
  }
  return decision;
}
