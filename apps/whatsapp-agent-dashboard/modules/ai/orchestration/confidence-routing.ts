export type AiFactRisk =
  | "GENERAL"
  | "FEE"
  | "DATE"
  | "LINK"
  | "POLICY"
  | "REFUND"
  | "PROMISE";

export type AiResponseCandidate = {
  text: string;
  confidence: number;
  factRisk: AiFactRisk;
  sourceReferences: readonly string[];
  safetyPassed: boolean;
  sensitive: boolean;
};

export type AiRoutingPolicy = {
  autoSendThreshold: number;
  approvalThreshold: number;
};

export type AiRoutingDecision =
  | { route: "AUTO_SEND"; reason: string }
  | { route: "APPROVAL"; reason: string }
  | { route: "HANDOFF"; reason: string };

const GROUNDED_FACT_TYPES = new Set<AiFactRisk>([
  "FEE",
  "DATE",
  "LINK",
  "POLICY",
  "REFUND",
  "PROMISE",
]);

export function routeAiCandidate(
  candidate: AiResponseCandidate,
  policy: AiRoutingPolicy,
): AiRoutingDecision {
  if (!candidate.text.trim()) return { route: "HANDOFF", reason: "Empty model output." };
  if (!candidate.safetyPassed) return { route: "HANDOFF", reason: "Safety evaluation failed." };
  if (candidate.sensitive) return { route: "HANDOFF", reason: "Sensitive request requires human handling." };
  if (!Number.isFinite(candidate.confidence) || candidate.confidence < 0 || candidate.confidence > 1) {
    return { route: "HANDOFF", reason: "Invalid confidence score." };
  }
  if (
    !Number.isFinite(policy.autoSendThreshold) ||
    !Number.isFinite(policy.approvalThreshold) ||
    policy.autoSendThreshold < policy.approvalThreshold ||
    policy.autoSendThreshold > 1 ||
    policy.approvalThreshold < 0
  ) {
    throw new Error("AI routing thresholds are invalid.");
  }

  if (GROUNDED_FACT_TYPES.has(candidate.factRisk) && candidate.sourceReferences.length === 0) {
    return { route: "HANDOFF", reason: "High-risk factual answer has no approved source reference." };
  }
  if (candidate.confidence >= policy.autoSendThreshold) {
    return { route: "AUTO_SEND", reason: "Confidence and grounding gates passed." };
  }
  if (candidate.confidence >= policy.approvalThreshold) {
    return { route: "APPROVAL", reason: "Candidate requires counselor approval." };
  }
  return { route: "HANDOFF", reason: "Confidence is below the approval threshold." };
}
