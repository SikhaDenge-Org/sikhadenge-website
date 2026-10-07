import {
  evaluateRolloutPromotion,
  rolloutModeIndex,
  type RolloutEvidence,
  type RolloutMode,
} from "@/modules/release/domain/rollout-policy";

export const CONTROLLED_LAUNCH_STAGES = [
  "INTERNAL_TEST_IDENTITIES",
  "ONE_CONNECTED_ACCOUNT",
  "ONE_INSTAGRAM_ASSET",
  "ONE_KEYWORD_AUTOMATION",
  "ONE_COUNSELOR_GROUP",
  "LIMITED_REAL_LEADS",
  "BROADER_INSTAGRAM_COVERAGE",
  "MESSENGER_FACEBOOK_COVERAGE",
  "ADDITIONAL_APPROVED_CHANNELS",
  "STABLE_FULL_ROLLOUT",
] as const;

export type ControlledLaunchStage =
  (typeof CONTROLLED_LAUNCH_STAGES)[number];

export type ControlledLaunchScope = {
  workspaceId: string;
  connectedAccountIds: readonly string[];
  instagramAssetIds: readonly string[];
  automationIds: readonly string[];
  counselorGroupIds: readonly string[];
  enabledChannels: readonly string[];
  maxRealLeads: number;
  externalWritesRequested: boolean;
};

export type ControlledLaunchEvidence =
  RolloutEvidence & {
    scopeApproved: boolean;
    smokeTestVerified: boolean;
    supportRunbookActive: boolean;
    observationWindowComplete: boolean;
    humanApprovalEnforced: boolean;
    boundedAutopilotApproved: boolean;
    approvedFlowsOnlyEnforced: boolean;
    productionEvidenceRecorded: boolean;
  };

export type ControlledWritePolicy =
  | "NO_EXTERNAL_WRITES"
  | "HUMAN_APPROVAL_REQUIRED"
  | "BOUNDED_AUTOPILOT"
  | "APPROVED_FLOWS_ONLY";

export type ControlledLaunchDecision =
  | {
      allowed: true;
      targetStage: ControlledLaunchStage;
      targetMode: RolloutMode;
      writePolicy: ControlledWritePolicy;
    }
  | {
      allowed: false;
      reason: string;
    };

export type ControlledLaunchRollbackDecision =
  | {
      required: false;
    }
  | {
      required: true;
      reason: string;
      targetStage: ControlledLaunchStage;
      targetMode: "SHADOW";
      externalWritesAllowed: false;
    };

export type Phase17ExitDecision = {
  phaseExitReady: boolean;
  blockers: readonly string[];
};

function stageIndex(
  stage: ControlledLaunchStage,
): number {
  return CONTROLLED_LAUNCH_STAGES.indexOf(stage);
}

function hasOnlyUniqueNonEmptyValues(
  values: readonly string[],
): boolean {
  const normalized = values.map((value) => value.trim());
  return (
    normalized.every(Boolean) &&
    new Set(normalized).size === normalized.length
  );
}

function validateScope(
  stage: ControlledLaunchStage,
  scope: ControlledLaunchScope,
): string | undefined {
  if (!scope.workspaceId.trim()) {
    return "A workspace scope is required.";
  }

  if (
    !Number.isInteger(scope.maxRealLeads) ||
    scope.maxRealLeads < 0
  ) {
    return "Real-lead limit must be a non-negative integer.";
  }

  const collections = [
    scope.connectedAccountIds,
    scope.instagramAssetIds,
    scope.automationIds,
    scope.counselorGroupIds,
    scope.enabledChannels,
  ];

  if (
    collections.some(
      (values) => !hasOnlyUniqueNonEmptyValues(values),
    )
  ) {
    return "Controlled launch scope values must be unique and non-empty.";
  }

  const channels = new Set(
    scope.enabledChannels.map((channel) => channel.trim().toLowerCase()),
  );

  switch (stage) {
    case "INTERNAL_TEST_IDENTITIES":
      if (scope.maxRealLeads !== 0) {
        return "Internal-test stage cannot include real leads.";
      }
      return undefined;
    case "ONE_CONNECTED_ACCOUNT":
      if (scope.connectedAccountIds.length !== 1) {
        return "One-connected-account stage requires exactly one connected account.";
      }
      return undefined;
    case "ONE_INSTAGRAM_ASSET":
      if (
        scope.connectedAccountIds.length !== 1 ||
        scope.instagramAssetIds.length !== 1 ||
        !channels.has("instagram")
      ) {
        return "Instagram canary stage requires one connected account, one Instagram asset, and the Instagram channel.";
      }
      return undefined;
    case "ONE_KEYWORD_AUTOMATION":
      if (scope.automationIds.length !== 1) {
        return "Keyword-automation stage requires exactly one automation.";
      }
      return undefined;
    case "ONE_COUNSELOR_GROUP":
      if (scope.counselorGroupIds.length !== 1) {
        return "Counselor canary stage requires exactly one counselor group.";
      }
      return undefined;
    case "LIMITED_REAL_LEADS":
      if (scope.maxRealLeads <= 0) {
        return "Limited-real-leads stage requires an explicit positive lead cap.";
      }
      return undefined;
    case "BROADER_INSTAGRAM_COVERAGE":
      if (!channels.has("instagram")) {
        return "Broader Instagram stage requires the Instagram channel.";
      }
      return undefined;
    case "MESSENGER_FACEBOOK_COVERAGE":
      if (
        !channels.has("messenger") ||
        !channels.has("facebook")
      ) {
        return "Messenger/Facebook stage requires both Messenger and Facebook channels.";
      }
      return undefined;
    case "ADDITIONAL_APPROVED_CHANNELS":
      if (scope.enabledChannels.length === 0) {
        return "Additional-channel stage requires at least one explicitly scoped channel.";
      }
      return undefined;
    case "STABLE_FULL_ROLLOUT":
      return undefined;
  }
}

function writePolicyForMode(
  mode: RolloutMode,
): ControlledWritePolicy {
  switch (mode) {
    case "SHADOW":
      return "NO_EXTERNAL_WRITES";
    case "APPROVAL_ONLY":
      return "HUMAN_APPROVAL_REQUIRED";
    case "LIMITED_AUTOPILOT":
      return "BOUNDED_AUTOPILOT";
    case "FULL_AUTOPILOT_FOR_APPROVED_FLOWS":
      return "APPROVED_FLOWS_ONLY";
  }
}

export function evaluateControlledLaunchPromotion(input: {
  currentStage?: ControlledLaunchStage;
  currentMode?: RolloutMode;
  targetStage: ControlledLaunchStage;
  targetMode: RolloutMode;
  scope: ControlledLaunchScope;
  evidence: ControlledLaunchEvidence;
}): ControlledLaunchDecision {
  const hasCurrentStage = Boolean(input.currentStage);
  const hasCurrentMode = Boolean(input.currentMode);

  if (hasCurrentStage !== hasCurrentMode) {
    return {
      allowed: false,
      reason: "Current rollout stage and mode must be supplied together.",
    };
  }

  const modeDecision = evaluateRolloutPromotion({
    currentMode: input.currentMode,
    targetMode: input.targetMode,
    evidence: input.evidence,
  });

  if (!modeDecision.allowed) {
    return modeDecision;
  }

  if (!input.evidence.scopeApproved) {
    return { allowed: false, reason: "Selected rollout scope is not approved." };
  }
  if (!input.evidence.smokeTestVerified) {
    return { allowed: false, reason: "Controlled smoke-test evidence is missing." };
  }
  if (!input.evidence.supportRunbookActive) {
    return { allowed: false, reason: "Support runbook is not active." };
  }

  const targetStageIndex = stageIndex(input.targetStage);

  if (!input.currentStage) {
    if (targetStageIndex !== 0) {
      return {
        allowed: false,
        reason: "A controlled launch must begin with internal test identities.",
      };
    }
  } else {
    const currentStageIndex = stageIndex(input.currentStage);

    if (targetStageIndex < currentStageIndex) {
      return {
        allowed: false,
        reason: "Launch promotion cannot move to an earlier stage; use controlled rollback.",
      };
    }
    if (targetStageIndex > currentStageIndex + 1) {
      return {
        allowed: false,
        reason: "Launch stages must advance one controlled scope at a time.",
      };
    }
    if (!input.evidence.observationWindowComplete) {
      return {
        allowed: false,
        reason: "The current rollout observation window is incomplete.",
      };
    }

    const modeAdvanced =
      rolloutModeIndex(input.targetMode) >
      rolloutModeIndex(input.currentMode!);
    const stageAdvanced = targetStageIndex > currentStageIndex;

    if (modeAdvanced && stageAdvanced) {
      return {
        allowed: false,
        reason: "Mode and rollout scope cannot be expanded in the same promotion.",
      };
    }

    if (!modeAdvanced && !stageAdvanced) {
      return {
        allowed: false,
        reason: "Promotion must advance either mode or rollout scope.",
      };
    }
  }

  const scopeIssue = validateScope(
    input.targetStage,
    input.scope,
  );
  if (scopeIssue) {
    return { allowed: false, reason: scopeIssue };
  }

  if (
    input.targetMode === "SHADOW" &&
    input.scope.externalWritesRequested
  ) {
    return {
      allowed: false,
      reason: "SHADOW mode cannot request external writes.",
    };
  }

  if (
    input.targetMode === "APPROVAL_ONLY" &&
    input.scope.externalWritesRequested &&
    !input.evidence.humanApprovalEnforced
  ) {
    return {
      allowed: false,
      reason: "Approval-only external writes require enforced human approval.",
    };
  }

  if (
    input.targetMode === "LIMITED_AUTOPILOT" &&
    input.scope.externalWritesRequested &&
    !input.evidence.boundedAutopilotApproved
  ) {
    return {
      allowed: false,
      reason: "Limited autopilot requires explicit bounded-autopilot approval.",
    };
  }

  if (
    input.targetMode === "FULL_AUTOPILOT_FOR_APPROVED_FLOWS"
  ) {
    if (input.targetStage !== "STABLE_FULL_ROLLOUT") {
      return {
        allowed: false,
        reason: "Full autopilot is only eligible at stable full rollout.",
      };
    }
    if (!input.evidence.approvedFlowsOnlyEnforced) {
      return {
        allowed: false,
        reason: "Full autopilot requires approved-flows-only enforcement.",
      };
    }
  }

  return {
    allowed: true,
    targetStage: input.targetStage,
    targetMode: input.targetMode,
    writePolicy: writePolicyForMode(input.targetMode),
  };
}

export function evaluateControlledLaunchRollback(input: {
  currentStage: ControlledLaunchStage;
  emergencyStopActive: boolean;
  unresolvedCriticalIncidents: number;
  unexplainedDuplicateSends: number;
  policyViolationDetected: boolean;
  permissionViolationDetected: boolean;
  monitoringBreachDetected: boolean;
}): ControlledLaunchRollbackDecision {
  let reason: string | undefined;

  if (input.emergencyStopActive) reason = "Emergency stop is active.";
  else if (input.unresolvedCriticalIncidents > 0) reason = "A critical incident requires rollback.";
  else if (input.unexplainedDuplicateSends > 0) reason = "Unexplained duplicate sends require rollback.";
  else if (input.permissionViolationDetected) reason = "Permission violation requires rollback.";
  else if (input.policyViolationDetected) reason = "Policy violation requires rollback.";
  else if (input.monitoringBreachDetected) reason = "Monitoring threshold breach requires rollback.";

  if (!reason) {
    return { required: false };
  }

  const current = stageIndex(input.currentStage);
  const target = CONTROLLED_LAUNCH_STAGES[
    Math.max(0, current - 1)
  ];

  return {
    required: true,
    reason,
    targetStage: target,
    targetMode: "SHADOW",
    externalWritesAllowed: false,
  };
}

export function evaluatePhase17Exit(input: {
  currentStage: ControlledLaunchStage;
  currentMode: RolloutMode;
  evidence: ControlledLaunchEvidence;
}): Phase17ExitDecision {
  const blockers: string[] = [];

  if (input.currentStage !== "STABLE_FULL_ROLLOUT") {
    blockers.push("stable full rollout stage has not been reached");
  }
  if (input.currentMode !== "FULL_AUTOPILOT_FOR_APPROVED_FLOWS") {
    blockers.push("final approved-flow rollout mode has not been reached");
  }
  if (!input.evidence.productionEvidenceRecorded) {
    blockers.push("production evidence has not been recorded");
  }
  if (!input.evidence.exactShaVerified) blockers.push("exact production SHA is not verified");
  if (!input.evidence.buildVerified) blockers.push("production build is not verified");
  if (!input.evidence.rollbackTested) blockers.push("production rollback is not tested");
  if (!input.evidence.monitoringActive) blockers.push("production monitoring is not active");
  if (!input.evidence.permissionsVerified) blockers.push("production permissions are not verified");
  if (!input.evidence.policyVerified) blockers.push("production policy is not verified");
  if (!input.evidence.supportRunbookActive) blockers.push("support runbook is not active");
  if (!input.evidence.smokeTestVerified) blockers.push("production smoke test is not verified");
  if (!input.evidence.observationWindowComplete) blockers.push("final observation window is incomplete");
  if (!input.evidence.approvedFlowsOnlyEnforced) blockers.push("approved-flows-only enforcement is missing");
  if (input.evidence.emergencyStopActive) blockers.push("emergency stop remains active");
  if (input.evidence.unresolvedCriticalIncidents > 0) blockers.push("critical incidents remain unresolved");
  if (input.evidence.unexplainedDuplicateSends > 0) blockers.push("unexplained duplicate sends remain unresolved");

  return {
    phaseExitReady: blockers.length === 0,
    blockers,
  };
}
