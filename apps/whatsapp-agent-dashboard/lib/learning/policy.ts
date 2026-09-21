import type { AgentDecision } from "../agent/types";

const AUTO_CAPTURE_REASONS = new Set([
  "LOW_CONFIDENCE",
  "MISSING_APPROVED_KNOWLEDGE",
  "AGENT_UNAVAILABLE",
]);

const NON_LEARNING_INTENTS = new Set([
  "GREETING",
  "OPT_OUT",
  "COUNSELOR_REQUEST",
  "PAYMENT_SUPPORT",
  "REFUND_OR_COMPLAINT",
]);

export function learningCategoryFromDecision(decision: AgentDecision): string {
  if (decision.handoffReason === "MISSING_APPROVED_KNOWLEDGE") {
    return "MISSING_KNOWLEDGE";
  }
  if (decision.handoffReason === "LOW_CONFIDENCE") return "LOW_CONFIDENCE";
  if (decision.handoffReason === "AGENT_UNAVAILABLE") return "AGENT_FAILURE";
  if (decision.intent === "UNKNOWN") return "UNANSWERED_QUESTION";
  if (decision.confidence < 0.72) return "LOW_CONFIDENCE";
  return decision.intent;
}

export function shouldCaptureLearningCandidate(decision: AgentDecision): boolean {
  if (NON_LEARNING_INTENTS.has(decision.intent)) return false;

  if (
    decision.handoffReason &&
    AUTO_CAPTURE_REASONS.has(decision.handoffReason)
  ) {
    return true;
  }

  if (decision.intent === "UNKNOWN") return true;
  return decision.confidence < 0.72;
}

export function validateProposedLearningAnswer(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 10) {
    throw new Error("Proposed answer must contain at least 10 characters.");
  }
  if (normalized.length > 4_000) {
    throw new Error("Proposed answer exceeds 4,000 characters.");
  }
  return normalized;
}
