import {
  evaluateRolloutPromotion,
  type RolloutEvidence,
  type RolloutMode,
} from "@/modules/release/domain/rollout-policy";
import {
  remainingProductionPhasesReady,
  remainingRepositoryPhasesComplete,
  type PhaseReadiness,
} from "@/modules/release/application/phase-readiness";

export type ReleaseExitDecision =
  | { allowed: true; targetMode: RolloutMode }
  | { allowed: false; reason: string };

export function evaluateReleaseExit(input: {
  phases: readonly PhaseReadiness[];
  currentMode?: RolloutMode;
  targetMode: RolloutMode;
  evidence: RolloutEvidence;
}): ReleaseExitDecision {
  if (!remainingRepositoryPhasesComplete(input.phases)) {
    return { allowed: false, reason: "Repository implementation is incomplete." };
  }
  if (!remainingProductionPhasesReady(input.phases)) {
    return { allowed: false, reason: "Production evidence is incomplete for one or more phases." };
  }
  return evaluateRolloutPromotion({
    currentMode: input.currentMode,
    targetMode: input.targetMode,
    evidence: input.evidence,
  });
}
