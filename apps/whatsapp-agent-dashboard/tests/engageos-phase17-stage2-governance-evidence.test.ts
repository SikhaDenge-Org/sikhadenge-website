import assert from "node:assert/strict";

import {
  deriveStage2GovernanceEvidence,
  STAGE2_GOVERNANCE_ACTIONS,
} from "@/modules/release/application/phase17-stage2-governance-evidence";

const liveSha = "sha-v12";
const candidateId = "wa-1";

const empty = deriveStage2GovernanceEvidence({
  liveSha,
  candidateId,
  exactShaVerified: true,
  permissionsVerified: true,
  emergencyStopActive: false,
  events: [],
});
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

const verified = (action: string, metadata: Record<string, unknown> = {}) => ({
  action,
  outcome: "VERIFIED",
  metadata: { liveSha, ...metadata },
});

const complete = deriveStage2GovernanceEvidence({
  liveSha,
  candidateId,
  exactShaVerified: true,
  permissionsVerified: true,
  emergencyStopActive: false,
  events: [
    verified(STAGE2_GOVERNANCE_ACTIONS.productionEvidence),
    verified(STAGE2_GOVERNANCE_ACTIONS.rollbackRehearsal),
    verified(STAGE2_GOVERNANCE_ACTIONS.monitoringActive),
    verified(STAGE2_GOVERNANCE_ACTIONS.policyVerified),
    verified(STAGE2_GOVERNANCE_ACTIONS.criticalIncidentReview, { unresolvedCriticalIncidents: 0 }),
    verified(STAGE2_GOVERNANCE_ACTIONS.duplicateSendReview, { unexplainedDuplicateSends: 0 }),
    verified(STAGE2_GOVERNANCE_ACTIONS.scopeApproved, { candidateId }),
    verified(STAGE2_GOVERNANCE_ACTIONS.authenticatedSmoke),
    verified(STAGE2_GOVERNANCE_ACTIONS.supportRunbookActive),
    verified(STAGE2_GOVERNANCE_ACTIONS.observationWindowComplete),
  ],
});
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

const stale = deriveStage2GovernanceEvidence({
  liveSha,
  candidateId,
  exactShaVerified: true,
  permissionsVerified: true,
  emergencyStopActive: false,
  events: [{
    action: STAGE2_GOVERNANCE_ACTIONS.productionEvidence,
    outcome: "VERIFIED",
    metadata: { liveSha: "old-sha" },
  }],
});
assert.equal(stale.buildVerified, false);
assert.equal(stale.productionEvidenceRecorded, false);

const wrongScope = deriveStage2GovernanceEvidence({
  liveSha,
  candidateId,
  exactShaVerified: true,
  permissionsVerified: true,
  emergencyStopActive: false,
  events: [verified(STAGE2_GOVERNANCE_ACTIONS.scopeApproved, { candidateId: "other" })],
});
assert.equal(wrongScope.scopeApproved, false);

console.log("PASS: engageos phase17 stage2 governance evidence");
