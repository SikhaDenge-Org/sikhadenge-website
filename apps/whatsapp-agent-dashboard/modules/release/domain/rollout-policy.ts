export const ROLLOUT_MODES = [
  "SHADOW",
  "APPROVAL_ONLY",
  "LIMITED_AUTOPILOT",
  "FULL_AUTOPILOT_FOR_APPROVED_FLOWS",
] as const;

export type RolloutMode =
  (typeof ROLLOUT_MODES)[number];

export type RolloutEvidence = {
  exactShaVerified: boolean;
  buildVerified: boolean;
  rollbackTested: boolean;
  monitoringActive: boolean;
  permissionsVerified: boolean;
  policyVerified: boolean;
  unresolvedCriticalIncidents: number;
  unexplainedDuplicateSends: number;
  emergencyStopActive: boolean;
};

export type RolloutDecision =
  | { allowed: true; targetMode: RolloutMode }
  | { allowed: false; reason: string };

export function rolloutModeIndex(
  mode: RolloutMode,
): number {
  return ROLLOUT_MODES.indexOf(mode);
}

export function evaluateRolloutPromotion(input: {
  currentMode?: RolloutMode;
  targetMode: RolloutMode;
  evidence: RolloutEvidence;
}): RolloutDecision {
  if (input.evidence.emergencyStopActive) {
    return { allowed: false, reason: "Emergency stop is active." };
  }
  if (input.evidence.unresolvedCriticalIncidents > 0) {
    return { allowed: false, reason: "Critical incidents remain unresolved." };
  }
  if (input.evidence.unexplainedDuplicateSends > 0) {
    return { allowed: false, reason: "Duplicate-send incidents require resolution." };
  }
  if (
    !input.evidence.exactShaVerified ||
    !input.evidence.buildVerified ||
    !input.evidence.rollbackTested ||
    !input.evidence.monitoringActive ||
    !input.evidence.permissionsVerified ||
    !input.evidence.policyVerified
  ) {
    return { allowed: false, reason: "Required release evidence is incomplete." };
  }

  const target = rolloutModeIndex(input.targetMode);

  if (!input.currentMode) {
    if (target !== 0) {
      return {
        allowed: false,
        reason: "A new rollout must start in SHADOW mode.",
      };
    }
    return { allowed: true, targetMode: input.targetMode };
  }

  const current = rolloutModeIndex(input.currentMode);

  if (target < current) {
    return {
      allowed: false,
      reason: "Rollout promotion cannot move backwards; use the controlled rollback path.",
    };
  }

  if (target > current + 1) {
    return {
      allowed: false,
      reason: "Rollout modes must be promoted one controlled step at a time.",
    };
  }

  return { allowed: true, targetMode: input.targetMode };
}
