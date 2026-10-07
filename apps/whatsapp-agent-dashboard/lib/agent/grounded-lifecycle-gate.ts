import {
  evaluateGroundedSend,
  groundedAiPolicyEnabled,
} from "@/modules/ai/orchestration/grounded-send-gate";
import type { AgentDecision } from "./types";

type Environment = Readonly<Record<string, string | undefined>>;

function numberEnvironment(
  env: Environment,
  name: string,
  fallback: number,
): number {
  const value = Number(env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export function evaluateAgentDecisionForExternalSend(
  decision: AgentDecision,
  env: Environment = process.env,
) {
  return evaluateGroundedSend({
    enabled: groundedAiPolicyEnabled(env),
    intent: decision.intent,
    confidence: decision.confidence,
    sourceReferenceIds: decision.knowledgeReferences.map((reference) => reference.chunkId),
    safetyPassed: decision.safety.safe,
    sensitive: decision.safety.sensitiveDataDetected,
    requiresHuman: decision.requiresHuman,
    autoSendThreshold: numberEnvironment(env, "ENGAGEOS_AI_AUTO_SEND_THRESHOLD", 0.9),
    approvalThreshold: numberEnvironment(env, "ENGAGEOS_AI_APPROVAL_THRESHOLD", 0.72),
  });
}
