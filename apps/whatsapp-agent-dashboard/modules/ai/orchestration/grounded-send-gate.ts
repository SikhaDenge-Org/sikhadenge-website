export type GroundedSendRoute = "LEGACY_BYPASS" | "AUTO_SEND" | "APPROVAL" | "HANDOFF";

export type GroundedSendDecision = {
  route: GroundedSendRoute;
  allowedToAutoSend: boolean;
  reason: string;
  highRiskFact: boolean;
  sourceReferenceCount: number;
};

const HIGH_RISK_INTENTS = new Set([
  "COURSE_DETAILS",
  "FEES",
  "BATCH_SCHEDULE",
  "DEMO_CLASS",
  "ELIGIBILITY",
  "CERTIFICATE",
  "ENROLLMENT",
  "PAYMENT_SUPPORT",
  "REFUND_OR_COMPLAINT",
]);

export function groundedAiPolicyEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.ENGAGEOS_GROUNDED_AI_POLICY_ENFORCED?.trim().toLowerCase() === "true";
}

export function evaluateGroundedSend(input: {
  enabled: boolean;
  intent: string;
  confidence: number;
  sourceReferenceIds: readonly string[];
  safetyPassed: boolean;
  sensitive: boolean;
  requiresHuman: boolean;
  autoSendThreshold?: number;
  approvalThreshold?: number;
}): GroundedSendDecision {
  const sourceReferenceIds = Array.from(
    new Set(input.sourceReferenceIds.map((value) => value.trim()).filter(Boolean)),
  );
  const highRiskFact = HIGH_RISK_INTENTS.has(input.intent.trim().toUpperCase());

  if (!input.enabled) {
    return {
      route: "LEGACY_BYPASS",
      allowedToAutoSend: true,
      reason: "Grounded AI enforcement is disabled; legacy policy remains authoritative.",
      highRiskFact,
      sourceReferenceCount: sourceReferenceIds.length,
    };
  }

  const autoSendThreshold = input.autoSendThreshold ?? 0.9;
  const approvalThreshold = input.approvalThreshold ?? 0.72;
  if (
    !Number.isFinite(autoSendThreshold) ||
    !Number.isFinite(approvalThreshold) ||
    approvalThreshold < 0 ||
    autoSendThreshold > 1 ||
    autoSendThreshold < approvalThreshold
  ) {
    throw new Error("Grounded AI confidence thresholds are invalid.");
  }

  if (input.requiresHuman) {
    return {
      route: "HANDOFF",
      allowedToAutoSend: false,
      reason: "Upstream agent decision requires human handling.",
      highRiskFact,
      sourceReferenceCount: sourceReferenceIds.length,
    };
  }
  if (!input.safetyPassed || input.sensitive) {
    return {
      route: "HANDOFF",
      allowedToAutoSend: false,
      reason: !input.safetyPassed
        ? "Safety evaluation failed."
        : "Sensitive content requires human handling.",
      highRiskFact,
      sourceReferenceCount: sourceReferenceIds.length,
    };
  }
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) {
    return {
      route: "HANDOFF",
      allowedToAutoSend: false,
      reason: "Agent confidence is invalid.",
      highRiskFact,
      sourceReferenceCount: sourceReferenceIds.length,
    };
  }
  if (highRiskFact && sourceReferenceIds.length === 0) {
    return {
      route: "HANDOFF",
      allowedToAutoSend: false,
      reason: "High-risk factual answer has no approved knowledge reference.",
      highRiskFact,
      sourceReferenceCount: 0,
    };
  }
  if (input.confidence >= autoSendThreshold) {
    return {
      route: "AUTO_SEND",
      allowedToAutoSend: true,
      reason: "Safety, grounding and confidence gates passed.",
      highRiskFact,
      sourceReferenceCount: sourceReferenceIds.length,
    };
  }
  if (input.confidence >= approvalThreshold) {
    return {
      route: "APPROVAL",
      allowedToAutoSend: false,
      reason: "Candidate requires counselor approval before external send.",
      highRiskFact,
      sourceReferenceCount: sourceReferenceIds.length,
    };
  }
  return {
    route: "HANDOFF",
    allowedToAutoSend: false,
    reason: "Confidence is below the approval threshold.",
    highRiskFact,
    sourceReferenceCount: sourceReferenceIds.length,
  };
}
