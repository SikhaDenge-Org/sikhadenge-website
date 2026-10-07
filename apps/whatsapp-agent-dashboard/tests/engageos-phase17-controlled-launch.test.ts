import assert from "node:assert/strict";

import {
  evaluateControlledLaunchPromotion,
  evaluateControlledLaunchRollback,
  evaluatePhase17Exit,
  type ControlledLaunchEvidence,
  type ControlledLaunchScope,
} from "../modules/release/application/controlled-launch";

const completeEvidence: ControlledLaunchEvidence = {
  exactShaVerified: true,
  buildVerified: true,
  rollbackTested: true,
  monitoringActive: true,
  permissionsVerified: true,
  policyVerified: true,
  unresolvedCriticalIncidents: 0,
  unexplainedDuplicateSends: 0,
  emergencyStopActive: false,
  scopeApproved: true,
  smokeTestVerified: true,
  supportRunbookActive: true,
  observationWindowComplete: true,
  humanApprovalEnforced: true,
  boundedAutopilotApproved: true,
  approvedFlowsOnlyEnforced: true,
  productionEvidenceRecorded: false,
};

function scope(
  overrides: Partial<ControlledLaunchScope> = {},
): ControlledLaunchScope {
  return {
    workspaceId: "workspace-phase17",
    connectedAccountIds: [],
    instagramAssetIds: [],
    automationIds: [],
    counselorGroupIds: [],
    enabledChannels: [],
    maxRealLeads: 0,
    externalWritesRequested: false,
    ...overrides,
  };
}

function testFreshLaunchMustStartShadowAndInternal() {
  const allowed = evaluateControlledLaunchPromotion({
    targetStage: "INTERNAL_TEST_IDENTITIES",
    targetMode: "SHADOW",
    scope: scope(),
    evidence: {
      ...completeEvidence,
      observationWindowComplete: false,
    },
  });
  assert.equal(allowed.allowed, true);
  if (allowed.allowed) {
    assert.equal(allowed.writePolicy, "NO_EXTERNAL_WRITES");
  }

  const fullStart = evaluateControlledLaunchPromotion({
    targetStage: "INTERNAL_TEST_IDENTITIES",
    targetMode: "FULL_AUTOPILOT_FOR_APPROVED_FLOWS",
    scope: scope(),
    evidence: completeEvidence,
  });
  assert.equal(fullStart.allowed, false);
  if (!fullStart.allowed) assert.match(fullStart.reason, /start in SHADOW/i);

  const skippedStage = evaluateControlledLaunchPromotion({
    targetStage: "ONE_CONNECTED_ACCOUNT",
    targetMode: "SHADOW",
    scope: scope({ connectedAccountIds: ["account-1"] }),
    evidence: completeEvidence,
  });
  assert.equal(skippedStage.allowed, false);
  if (!skippedStage.allowed) assert.match(skippedStage.reason, /internal test identities/i);
}

function testShadowCannotWrite() {
  const decision = evaluateControlledLaunchPromotion({
    targetStage: "INTERNAL_TEST_IDENTITIES",
    targetMode: "SHADOW",
    scope: scope({ externalWritesRequested: true }),
    evidence: completeEvidence,
  });
  assert.equal(decision.allowed, false);
  if (!decision.allowed) assert.match(decision.reason, /cannot request external writes/i);
}

function testStageAndModeCannotSkipOrExpandTogether() {
  const stageSkip = evaluateControlledLaunchPromotion({
    currentStage: "INTERNAL_TEST_IDENTITIES",
    currentMode: "SHADOW",
    targetStage: "ONE_INSTAGRAM_ASSET",
    targetMode: "SHADOW",
    scope: scope({
      connectedAccountIds: ["account-1"],
      instagramAssetIds: ["media-1"],
      enabledChannels: ["instagram"],
    }),
    evidence: completeEvidence,
  });
  assert.equal(stageSkip.allowed, false);
  if (!stageSkip.allowed) assert.match(stageSkip.reason, /one controlled scope/i);

  const modeSkip = evaluateControlledLaunchPromotion({
    currentStage: "INTERNAL_TEST_IDENTITIES",
    currentMode: "SHADOW",
    targetStage: "INTERNAL_TEST_IDENTITIES",
    targetMode: "LIMITED_AUTOPILOT",
    scope: scope(),
    evidence: completeEvidence,
  });
  assert.equal(modeSkip.allowed, false);
  if (!modeSkip.allowed) assert.match(modeSkip.reason, /one controlled step/i);

  const both = evaluateControlledLaunchPromotion({
    currentStage: "INTERNAL_TEST_IDENTITIES",
    currentMode: "SHADOW",
    targetStage: "ONE_CONNECTED_ACCOUNT",
    targetMode: "APPROVAL_ONLY",
    scope: scope({ connectedAccountIds: ["account-1"] }),
    evidence: completeEvidence,
  });
  assert.equal(both.allowed, false);
  if (!both.allowed) assert.match(both.reason, /cannot be expanded in the same promotion/i);
}

function testObservationAndApprovalControls() {
  const observationBlocked = evaluateControlledLaunchPromotion({
    currentStage: "INTERNAL_TEST_IDENTITIES",
    currentMode: "SHADOW",
    targetStage: "ONE_CONNECTED_ACCOUNT",
    targetMode: "SHADOW",
    scope: scope({ connectedAccountIds: ["account-1"] }),
    evidence: {
      ...completeEvidence,
      observationWindowComplete: false,
    },
  });
  assert.equal(observationBlocked.allowed, false);
  if (!observationBlocked.allowed) assert.match(observationBlocked.reason, /observation window/i);

  const approvalBlocked = evaluateControlledLaunchPromotion({
    currentStage: "INTERNAL_TEST_IDENTITIES",
    currentMode: "SHADOW",
    targetStage: "INTERNAL_TEST_IDENTITIES",
    targetMode: "APPROVAL_ONLY",
    scope: scope({ externalWritesRequested: true }),
    evidence: {
      ...completeEvidence,
      humanApprovalEnforced: false,
    },
  });
  assert.equal(approvalBlocked.allowed, false);
  if (!approvalBlocked.allowed) assert.match(approvalBlocked.reason, /human approval/i);

  const approved = evaluateControlledLaunchPromotion({
    currentStage: "INTERNAL_TEST_IDENTITIES",
    currentMode: "SHADOW",
    targetStage: "INTERNAL_TEST_IDENTITIES",
    targetMode: "APPROVAL_ONLY",
    scope: scope({ externalWritesRequested: true }),
    evidence: completeEvidence,
  });
  assert.equal(approved.allowed, true);
  if (approved.allowed) {
    assert.equal(approved.writePolicy, "HUMAN_APPROVAL_REQUIRED");
  }
}

function testBoundedAutopilotAndFullRolloutRules() {
  const limitedBlocked = evaluateControlledLaunchPromotion({
    currentStage: "LIMITED_REAL_LEADS",
    currentMode: "APPROVAL_ONLY",
    targetStage: "LIMITED_REAL_LEADS",
    targetMode: "LIMITED_AUTOPILOT",
    scope: scope({
      maxRealLeads: 25,
      externalWritesRequested: true,
    }),
    evidence: {
      ...completeEvidence,
      boundedAutopilotApproved: false,
    },
  });
  assert.equal(limitedBlocked.allowed, false);
  if (!limitedBlocked.allowed) assert.match(limitedBlocked.reason, /bounded-autopilot approval/i);

  const earlyFull = evaluateControlledLaunchPromotion({
    currentStage: "BROADER_INSTAGRAM_COVERAGE",
    currentMode: "LIMITED_AUTOPILOT",
    targetStage: "BROADER_INSTAGRAM_COVERAGE",
    targetMode: "FULL_AUTOPILOT_FOR_APPROVED_FLOWS",
    scope: scope({ enabledChannels: ["instagram"] }),
    evidence: completeEvidence,
  });
  assert.equal(earlyFull.allowed, false);
  if (!earlyFull.allowed) assert.match(earlyFull.reason, /stable full rollout/i);

  const finalMode = evaluateControlledLaunchPromotion({
    currentStage: "STABLE_FULL_ROLLOUT",
    currentMode: "LIMITED_AUTOPILOT",
    targetStage: "STABLE_FULL_ROLLOUT",
    targetMode: "FULL_AUTOPILOT_FOR_APPROVED_FLOWS",
    scope: scope({ externalWritesRequested: true }),
    evidence: completeEvidence,
  });
  assert.equal(finalMode.allowed, true);
  if (finalMode.allowed) {
    assert.equal(finalMode.writePolicy, "APPROVED_FLOWS_ONLY");
  }
}

function testBackwardPromotionRequiresRollbackPath() {
  const decision = evaluateControlledLaunchPromotion({
    currentStage: "ONE_CONNECTED_ACCOUNT",
    currentMode: "APPROVAL_ONLY",
    targetStage: "ONE_CONNECTED_ACCOUNT",
    targetMode: "SHADOW",
    scope: scope({ connectedAccountIds: ["account-1"] }),
    evidence: completeEvidence,
  });
  assert.equal(decision.allowed, false);
  if (!decision.allowed) assert.match(decision.reason, /controlled rollback path/i);
}

function testIncidentForcesShadowRollback() {
  const rollback = evaluateControlledLaunchRollback({
    currentStage: "ONE_COUNSELOR_GROUP",
    emergencyStopActive: false,
    unresolvedCriticalIncidents: 1,
    unexplainedDuplicateSends: 0,
    policyViolationDetected: false,
    permissionViolationDetected: false,
    monitoringBreachDetected: false,
  });
  assert.equal(rollback.required, true);
  if (rollback.required) {
    assert.equal(rollback.targetStage, "ONE_KEYWORD_AUTOMATION");
    assert.equal(rollback.targetMode, "SHADOW");
    assert.equal(rollback.externalWritesAllowed, false);
  }

  const healthy = evaluateControlledLaunchRollback({
    currentStage: "LIMITED_REAL_LEADS",
    emergencyStopActive: false,
    unresolvedCriticalIncidents: 0,
    unexplainedDuplicateSends: 0,
    policyViolationDetected: false,
    permissionViolationDetected: false,
    monitoringBreachDetected: false,
  });
  assert.deepEqual(healthy, { required: false });
}

function testPhaseExitRequiresRecordedProductionEvidence() {
  const blocked = evaluatePhase17Exit({
    currentStage: "STABLE_FULL_ROLLOUT",
    currentMode: "FULL_AUTOPILOT_FOR_APPROVED_FLOWS",
    evidence: completeEvidence,
  });
  assert.equal(blocked.phaseExitReady, false);
  assert.match(blocked.blockers.join(" "), /production evidence/i);

  const ready = evaluatePhase17Exit({
    currentStage: "STABLE_FULL_ROLLOUT",
    currentMode: "FULL_AUTOPILOT_FOR_APPROVED_FLOWS",
    evidence: {
      ...completeEvidence,
      productionEvidenceRecorded: true,
    },
  });
  assert.equal(ready.phaseExitReady, true);
  assert.deepEqual(ready.blockers, []);
}

testFreshLaunchMustStartShadowAndInternal();
testShadowCannotWrite();
testStageAndModeCannotSkipOrExpandTogether();
testObservationAndApprovalControls();
testBoundedAutopilotAndFullRolloutRules();
testBackwardPromotionRequiresRollbackPath();
testIncidentForcesShadowRollback();
testPhaseExitRequiresRecordedProductionEvidence();

console.log("EngageOS Phase 17 controlled launch gates: PASS");
