import assert from "node:assert/strict";

import {
  deriveStage2GovernanceEvidence,
  STAGE2_GOVERNANCE_ACTIONS,
  STAGE2_GOVERNANCE_ENTITY_TYPE,
  STAGE2_MACHINE_REASON_CODE,
  STAGE2_OPERATOR_REASON_CODE,
} from "@/modules/release/application/phase17-stage2-governance-evidence";

const liveSha = "sha-current";
const candidateId = "wa-1";
const verifiedAt = "2026-09-13T12:00:00.000Z";

type GovernanceEvents = Parameters<typeof deriveStage2GovernanceEvidence>[0]["events"];

const derive = (events: GovernanceEvents) => deriveStage2GovernanceEvidence({
  liveSha,
  candidateId,
  exactShaVerified: true,
  permissionsVerified: true,
  emergencyStopActive: false,
  events,
});

const empty = derive([]);
assert.equal(empty.buildVerified, false);
assert.equal(empty.rollbackTested, false);
assert.equal(empty.monitoringActive, false);
assert.equal(empty.policyVerified, false);
assert.equal(empty.scopeApproved, false);
assert.equal(empty.smokeTestVerified, false);
assert.equal(empty.supportRunbookActive, false);
assert.equal(empty.observationWindowComplete, false);
assert.equal(empty.productionEvidenceRecorded, false);
assert.equal(empty.unresolvedCriticalIncidents, 1);
assert.equal(empty.unexplainedDuplicateSends, 1);

const machineVerified = (action: string, metadata: Record<string, unknown>) => ({
  action,
  outcome: "VERIFIED",
  entityType: STAGE2_GOVERNANCE_ENTITY_TYPE,
  entityId: liveSha,
  reasonCode: STAGE2_MACHINE_REASON_CODE,
  actorId: null,
  requestId: `machine:${action}`,
  metadata: { liveSha, ...metadata },
});

const operatorVerified = (action: string, metadata: Record<string, unknown>) => ({
  action,
  outcome: "VERIFIED",
  entityType: STAGE2_GOVERNANCE_ENTITY_TYPE,
  entityId: liveSha,
  reasonCode: STAGE2_OPERATOR_REASON_CODE,
  actorId: "operator-1",
  requestId: `operator:${action}`,
  metadata: {
    liveSha,
    proofRef: `evidence://${action}`,
    verifiedAt,
    ...metadata,
  },
});

const production = machineVerified(STAGE2_GOVERNANCE_ACTIONS.productionEvidence, {
  source: "github-actions-production-batch1-plus-postdeploy-proof",
  productionRunId: "34754855602",
  productionRunNumber: "1",
  productionWorkflowConclusion: "success",
  exactLiveShaVerified: true,
  trackedWorktreeClean: true,
  processHealthVerified: true,
  loginSmokeVerified: true,
});

const policy = machineVerified(STAGE2_GOVERNANCE_ACTIONS.policyVerified, {
  source: "github-actions-phase17-stage2-machine-evidence",
  policyRunId: "34761516182",
  policyCommitSha: liveSha,
  checks: [
    "typecheck",
    "phase17-controlled-launch",
    "phase17-production-readiness",
    "stage2-governance-evidence",
    "stage2-machine-evidence-policy",
  ],
});

const complete = derive([
  production,
  operatorVerified(STAGE2_GOVERNANCE_ACTIONS.rollbackRehearsal, { result: "PASS" }),
  operatorVerified(STAGE2_GOVERNANCE_ACTIONS.monitoringActive, { monitoringStatus: "ACTIVE" }),
  policy,
  operatorVerified(STAGE2_GOVERNANCE_ACTIONS.criticalIncidentReview, { unresolvedCriticalIncidents: 0 }),
  operatorVerified(STAGE2_GOVERNANCE_ACTIONS.duplicateSendReview, { unexplainedDuplicateSends: 0 }),
  operatorVerified(STAGE2_GOVERNANCE_ACTIONS.scopeApproved, { candidateId, decision: "APPROVED" }),
  operatorVerified(STAGE2_GOVERNANCE_ACTIONS.authenticatedSmoke, {
    result: "PASS",
    authenticated: true,
    readOnly: true,
    externalWritesAttempted: false,
  }),
  operatorVerified(STAGE2_GOVERNANCE_ACTIONS.supportRunbookActive, { runbookStatus: "ACTIVE" }),
  operatorVerified(STAGE2_GOVERNANCE_ACTIONS.observationWindowComplete, {
    complete: true,
    windowStartedAt: "2026-09-13T10:00:00.000Z",
    windowEndedAt: "2026-09-13T12:00:00.000Z",
  }),
]);
assert.equal(complete.buildVerified, true);
assert.equal(complete.rollbackTested, true);
assert.equal(complete.monitoringActive, true);
assert.equal(complete.policyVerified, true);
assert.equal(complete.scopeApproved, true);
assert.equal(complete.smokeTestVerified, true);
assert.equal(complete.supportRunbookActive, true);
assert.equal(complete.observationWindowComplete, true);
assert.equal(complete.productionEvidenceRecorded, true);
assert.equal(complete.unresolvedCriticalIncidents, 0);
assert.equal(complete.unexplainedDuplicateSends, 0);

const stale = derive([{ ...production, entityId: "old-sha", metadata: { ...production.metadata, liveSha: "old-sha" } }]);
assert.equal(stale.buildVerified, false);
assert.equal(stale.productionEvidenceRecorded, false);

const metadataOnly = derive([{
  action: STAGE2_GOVERNANCE_ACTIONS.monitoringActive,
  outcome: "VERIFIED",
  metadata: { liveSha, monitoringStatus: "ACTIVE" },
}]);
assert.equal(metadataOnly.monitoringActive, false);

const wrongReason = derive([{
  ...operatorVerified(STAGE2_GOVERNANCE_ACTIONS.rollbackRehearsal, { result: "PASS" }),
  reasonCode: "GENERIC_VERIFIED",
}]);
assert.equal(wrongReason.rollbackTested, false);

const missingProofRef = derive([{
  ...operatorVerified(STAGE2_GOVERNANCE_ACTIONS.supportRunbookActive, { runbookStatus: "ACTIVE" }),
  metadata: { liveSha, verifiedAt, runbookStatus: "ACTIVE" },
}]);
assert.equal(missingProofRef.supportRunbookActive, false);

const malformedMachineProduction = derive([machineVerified(STAGE2_GOVERNANCE_ACTIONS.productionEvidence, {
  source: "github-actions-production-batch1-plus-postdeploy-proof",
  productionRunId: "34754855602",
  productionRunNumber: "1",
  productionWorkflowConclusion: "success",
  exactLiveShaVerified: true,
  trackedWorktreeClean: true,
  processHealthVerified: true,
  loginSmokeVerified: false,
})]);
assert.equal(malformedMachineProduction.productionEvidenceRecorded, false);

const wrongScope = derive([operatorVerified(STAGE2_GOVERNANCE_ACTIONS.scopeApproved, {
  candidateId: "other",
  decision: "APPROVED",
})]);
assert.equal(wrongScope.scopeApproved, false);

const unsafeSmoke = derive([operatorVerified(STAGE2_GOVERNANCE_ACTIONS.authenticatedSmoke, {
  result: "PASS",
  authenticated: true,
  readOnly: false,
  externalWritesAttempted: true,
})]);
assert.equal(unsafeSmoke.smokeTestVerified, false);

const invertedObservation = derive([operatorVerified(STAGE2_GOVERNANCE_ACTIONS.observationWindowComplete, {
  complete: true,
  windowStartedAt: "2026-09-13T12:00:00.000Z",
  windowEndedAt: "2026-09-13T10:00:00.000Z",
})]);
assert.equal(invertedObservation.observationWindowComplete, false);

console.log("PASS: engageos phase17 stage2 governance evidence");
