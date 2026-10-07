import type {
  AgentDecision,
  AgentDecisionInput,
  AgentIntent,
  RiskLevel,
} from "../domain/types";

export const AUTO_SEND_CONFIDENCE = 0.86;
export const HUMAN_REVIEW_CONFIDENCE = 0.68;

const HIGH_RISK_INTENTS = new Set<AgentIntent>([
  "REFUND_OR_COMPLAINT",
  "PAYMENT_SUPPORT",
]);

export function getRiskLevel(intent: AgentIntent): RiskLevel {
  if (HIGH_RISK_INTENTS.has(intent)) return "HIGH";
  if (intent === "FEES" || intent === "CERTIFICATE") return "MEDIUM";
  return "LOW";
}

export function mustHandoff(input: {
  intent: AgentIntent;
  confidence: number;
  hasApprovedKnowledge: boolean;
  userRequestedHuman: boolean;
  optedOut: boolean;
}): { required: boolean; reason?: string } {
  if (input.optedOut) {
    return { required: false, reason: "Contact has opted out; no normal reply." };
  }

  if (input.userRequestedHuman || input.intent === "HUMAN_REQUEST") {
    return { required: true, reason: "User requested a human counselor." };
  }

  if (HIGH_RISK_INTENTS.has(input.intent)) {
    return { required: true, reason: "High-risk intent requires human handling." };
  }

  if (!input.hasApprovedKnowledge && input.intent !== "GREETING") {
    return {
      required: true,
      reason: "No approved knowledge supports a factual response.",
    };
  }

  if (input.confidence < HUMAN_REVIEW_CONFIDENCE) {
    return { required: true, reason: "Agent confidence is below review threshold." };
  }

  return { required: false };
}

export function validateDecision(
  input: AgentDecisionInput,
  decision: AgentDecision,
): AgentDecision {
  const confidence = Math.max(0, Math.min(1, decision.confidence));
  const optedOut = input.contact.optedOut || decision.intent === "OPT_OUT";
  const handoff = mustHandoff({
    intent: decision.intent,
    confidence,
    hasApprovedKnowledge: decision.knowledgeReferences.length > 0,
    userRequestedHuman: decision.intent === "HUMAN_REQUEST",
    optedOut,
  });

  if (optedOut) {
    return {
      ...decision,
      confidence,
      draftReply:
        decision.intent === "OPT_OUT"
          ? "Aapki request note kar li gayi hai. Aapko promotional messages nahi bheje jayenge."
          : undefined,
      actions: [
        { type: "MARK_OPT_OUT" },
        ...(decision.intent === "OPT_OUT" ? [{ type: "SEND_REPLY" as const }] : []),
      ],
      requiresHumanReview: false,
      reviewReason: undefined,
    };
  }

  if (handoff.required) {
    return {
      ...decision,
      confidence,
      actions: [
        { type: "PAUSE_AI" },
        { type: "ASSIGN_COUNSELOR" },
      ],
      requiresHumanReview: true,
      reviewReason: handoff.reason,
    };
  }

  const mayAutoSend = confidence >= AUTO_SEND_CONFIDENCE;

  return {
    ...decision,
    confidence,
    risk: getRiskLevel(decision.intent),
    requiresHumanReview: !mayAutoSend,
    reviewReason: mayAutoSend
      ? undefined
      : "Reply is plausible but needs counselor approval before sending.",
  };
}
