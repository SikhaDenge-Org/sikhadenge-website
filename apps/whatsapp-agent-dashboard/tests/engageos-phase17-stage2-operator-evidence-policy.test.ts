import assert from "node:assert/strict";

import { STAGE2_GOVERNANCE_ACTIONS } from "@/modules/release/application/phase17-stage2-governance-evidence";
import {
  STAGE2_OPERATOR_ACTIONS,
  STAGE2_OPERATOR_ATTESTATION_PHRASE,
  STAGE2_OPERATOR_EVIDENCE_COMMIT_PHRASE,
  validateStage2OperatorEvidenceInput,
} from "@/modules/release/application/phase17-stage2-operator-evidence-input";
import { resolvePhase17OperatorRecorderBaseline } from "@/modules/release/application/phase17-stage2-operator-recorder-state";

const liveSha = "e9f65a6b853385dad5712c212f51a6f1b9f56a18";
const candidateId = "cmtv8n9v50001kw3hzm6b2y0b";
const verifiedAt = "2026-09-14T11:00:00.000Z";
const now = new Date("2026-09-14T12:00:00.000Z");

const base = {
  liveSha,
  actorId: "dashboard-user-real-id",
  proofRef: "github-actions://run/12345/job/67890",
  verifiedAt,
  requestId: "phase17-operator-test-request",
  expectedCandidateId: candidateId,
  now,
};

const validMetadata = new Map<string, Record<string, unknown>>([
  [STAGE2_GOVERNANCE_ACTIONS.criticalIncidentReview, { unresolvedCriticalIncidents: 0 }],
  [STAGE2_GOVERNANCE_ACTIONS.duplicateSendReview, { unexplainedDuplicateSends: 0 }],
  [STAGE2_GOVERNANCE_ACTIONS.rollbackRehearsal, { result: "PASS" }],
  [STAGE2_GOVERNANCE_ACTIONS.monitoringActive, { monitoringStatus: "ACTIVE" }],
  [STAGE2_GOVERNANCE_ACTIONS.scopeApproved, { candidateId, decision: "APPROVED" }],
  [STAGE2_GOVERNANCE_ACTIONS.authenticatedSmoke, {
    result: "PASS",
    authenticated: true,
    readOnly: true,
    externalWritesAttempted: false,
  }],
  [STAGE2_GOVERNANCE_ACTIONS.supportRunbookActive, { runbookStatus: "ACTIVE" }],
  [STAGE2_GOVERNANCE_ACTIONS.observationWindowComplete, {
    complete: true,
    windowStartedAt: "2026-09-14T09:00:00.000Z",
    windowEndedAt: "2026-09-14T10:30:00.000Z",
  }],
]);

assert.equal(resolvePhase17OperatorRecorderBaseline({
  stage: "INTERNAL_TEST_IDENTITIES",
  mode: "SHADOW",
  writePolicy: "NO_EXTERNAL_WRITES",
  externalWritesAllowed: false,
  version: 1,
}, 1), "STAGE1");

assert.equal(resolvePhase17OperatorRecorderBaseline({
  stage: "ONE_CONNECTED_ACCOUNT",
  mode: "SHADOW",
  writePolicy: "NO_EXTERNAL_WRITES",
  externalWritesAllowed: false,
  version: 2,
}, 2), "STAGE2");

assert.throws(() => resolvePhase17OperatorRecorderBaseline({
  stage: "ONE_CONNECTED_ACCOUNT",
  mode: "SHADOW",
  writePolicy: "NO_EXTERNAL_WRITES",
  externalWritesAllowed: true,
  version: 2,
}, 2), /exact Stage1 or Stage2 SHADOW no-external-writes baseline/);

for (const action of STAGE2_OPERATOR_ACTIONS) {
  const metadata = validMetadata.get(action);
  assert.ok(metadata, `missing fixture for ${action}`);
  const validated = validateStage2OperatorEvidenceInput({
    ...base,
    action,
    requestId: `request:${action}`,
    metadataJson: JSON.stringify(metadata),
  });
  assert.equal(validated.action, action);
  assert.equal(validated.liveSha, liveSha);
  assert.equal(validated.actorId, base.actorId);
  assert.equal(validated.metadata.liveSha, liveSha);
  assert.equal(validated.metadata.proofRef, base.proofRef);
  assert.equal(validated.metadata.verifiedAt, verifiedAt);
}

assert.equal(STAGE2_OPERATOR_EVIDENCE_COMMIT_PHRASE, "RECORD_OPERATOR_VERIFIED_EVIDENCE");
assert.equal(
  STAGE2_OPERATOR_ATTESTATION_PHRASE,
  "I_ATTEST_THIS_EVIDENCE_IS_REAL_AND_EXACT_SHA_BOUND",
);

assert.throws(
  () => validateStage2OperatorEvidenceInput({
    ...base,
    action: STAGE2_GOVERNANCE_ACTIONS.policyVerified,
    metadataJson: "{}",
  }),
  /Unsupported operator evidence action/,
);

assert.throws(
  () => validateStage2OperatorEvidenceInput({
    ...base,
    action: STAGE2_GOVERNANCE_ACTIONS.criticalIncidentReview,
    metadataJson: JSON.stringify({ unresolvedCriticalIncidents: "0" }),
  }),
  /numeric 0/,
);

assert.throws(
  () => validateStage2OperatorEvidenceInput({
    ...base,
    action: STAGE2_GOVERNANCE_ACTIONS.scopeApproved,
    metadataJson: JSON.stringify({ candidateId: "wrong-candidate", decision: "APPROVED" }),
  }),
  /candidateId must equal/,
);

assert.throws(
  () => validateStage2OperatorEvidenceInput({
    ...base,
    action: STAGE2_GOVERNANCE_ACTIONS.authenticatedSmoke,
    metadataJson: JSON.stringify({
      result: "PASS",
      authenticated: true,
      readOnly: true,
      externalWritesAttempted: true,
    }),
  }),
  /externalWritesAttempted must equal false/,
);

assert.throws(
  () => validateStage2OperatorEvidenceInput({
    ...base,
    action: STAGE2_GOVERNANCE_ACTIONS.monitoringActive,
    metadataJson: JSON.stringify({ monitoringStatus: "ACTIVE", liveSha }),
  }),
  /must not override reserved key liveSha/,
);

assert.throws(
  () => validateStage2OperatorEvidenceInput({
    ...base,
    action: STAGE2_GOVERNANCE_ACTIONS.observationWindowComplete,
    metadataJson: JSON.stringify({
      complete: true,
      windowStartedAt: "2026-09-14T10:30:00.000Z",
      windowEndedAt: "2026-09-14T09:00:00.000Z",
    }),
  }),
  /windowEndedAt must be at or after/,
);

assert.throws(
  () => validateStage2OperatorEvidenceInput({
    ...base,
    action: STAGE2_GOVERNANCE_ACTIONS.observationWindowComplete,
    metadataJson: JSON.stringify({
      complete: true,
      windowStartedAt: "2026-09-14T10:00:00.000Z",
      windowEndedAt: "2026-09-14T11:30:00.000Z",
    }),
  }),
  /windowEndedAt must not be after verifiedAt/,
);

assert.throws(
  () => validateStage2OperatorEvidenceInput({
    ...base,
    action: STAGE2_GOVERNANCE_ACTIONS.supportRunbookActive,
    verifiedAt: "2026-09-14T12:06:00.000Z",
    metadataJson: JSON.stringify({ runbookStatus: "ACTIVE" }),
  }),
  /must not be more than five minutes in the future/,
);

assert.throws(
  () => validateStage2OperatorEvidenceInput({
    ...base,
    action: STAGE2_GOVERNANCE_ACTIONS.rollbackRehearsal,
    liveSha: "NOT-A-SHA",
    metadataJson: JSON.stringify({ result: "PASS" }),
  }),
  /lowercase 40-character Git SHA/,
);

console.log("PASS: engageos phase17 stage2 operator evidence policy");
