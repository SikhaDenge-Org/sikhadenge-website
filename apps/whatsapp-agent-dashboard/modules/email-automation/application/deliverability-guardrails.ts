import type { EmailRuntimeMode } from "../domain/contracts";

export const EMAIL_DELIVERABILITY_HARD_BOUNCE_BLOCK_PCT = 5;
export const EMAIL_DELIVERABILITY_COMPLAINT_BLOCK_PCT = 0.1;

export type EmailDeliverabilitySnapshot = {
  spfAligned: boolean | null;
  dkimAligned: boolean | null;
  dmarcAligned: boolean | null;
  hardBounceRatePct: number | null;
  complaintRatePct: number | null;
};

export type EmailDeliverabilityDecision = {
  enforced: boolean;
  allowed: boolean;
  reasons: readonly string[];
  snapshot: EmailDeliverabilitySnapshot;
};

function booleanSignal(value: string | undefined): boolean | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "true" || normalized === "pass" || normalized === "aligned" || normalized === "verified") return true;
  if (normalized === "false" || normalized === "fail" || normalized === "misaligned" || normalized === "unverified") return false;
  return null;
}

function percentage(value: string | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

export function emailDeliverabilitySnapshotFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): EmailDeliverabilitySnapshot {
  return {
    spfAligned: booleanSignal(env.EMAIL_DELIVERABILITY_SPF_ALIGNED),
    dkimAligned: booleanSignal(env.EMAIL_DELIVERABILITY_DKIM_ALIGNED),
    dmarcAligned: booleanSignal(env.EMAIL_DELIVERABILITY_DMARC_ALIGNED),
    hardBounceRatePct: percentage(env.EMAIL_DELIVERABILITY_HARD_BOUNCE_RATE_PCT),
    complaintRatePct: percentage(env.EMAIL_DELIVERABILITY_COMPLAINT_RATE_PCT),
  };
}

export function evaluateEmailDeliverabilityGuardrails(input: {
  mode: EmailRuntimeMode;
  snapshot?: EmailDeliverabilitySnapshot;
  env?: NodeJS.ProcessEnv;
}): EmailDeliverabilityDecision {
  const snapshot = input.snapshot ?? emailDeliverabilitySnapshotFromEnv(input.env);
  const enforced = input.mode === "LIMITED_COHORT" || input.mode === "LIVE";
  if (!enforced) return { enforced: false, allowed: true, reasons: Object.freeze([]), snapshot };

  const reasons: string[] = [];
  if (snapshot.spfAligned !== true) reasons.push("SPF alignment is not positively qualified.");
  if (snapshot.dkimAligned !== true) reasons.push("DKIM alignment is not positively qualified.");
  if (snapshot.dmarcAligned !== true) reasons.push("DMARC alignment is not positively qualified.");

  if (snapshot.hardBounceRatePct == null) {
    reasons.push("Hard-bounce rate telemetry is missing or invalid.");
  } else if (snapshot.hardBounceRatePct >= EMAIL_DELIVERABILITY_HARD_BOUNCE_BLOCK_PCT) {
    reasons.push(`Hard-bounce rate ${snapshot.hardBounceRatePct}% is at or above the ${EMAIL_DELIVERABILITY_HARD_BOUNCE_BLOCK_PCT}% safety ceiling.`);
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
  snapshot?: EmailDeliverabilitySnapshot;
  env?: NodeJS.ProcessEnv;
}): EmailDeliverabilityDecision {
  const decision = evaluateEmailDeliverabilityGuardrails(input);
  if (!decision.allowed) {
    throw new Error(`Email deliverability guard blocked scaled external delivery: ${decision.reasons.join(" ")}`);
  }
  return decision;
}
