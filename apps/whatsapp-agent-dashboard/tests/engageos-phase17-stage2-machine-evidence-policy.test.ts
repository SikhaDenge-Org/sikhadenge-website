import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "scripts/engageos-phase17-stage2-record-machine-evidence.ts"),
  "utf8",
);

assert.match(source, /RECORD_MACHINE_VERIFIED_EVIDENCE/);
assert.match(source, /STAGE2_GOVERNANCE_ACTIONS\.productionEvidence/);
assert.match(source, /STAGE2_GOVERNANCE_ACTIONS\.policyVerified/);
assert.match(source, /PHASE17_MACHINE_EVIDENCE_COMMIT/);
assert.match(source, /PHASE17_EXPECTED_LIVE_SHA/);
assert.match(source, /Tracked production worktree is not clean/);
assert.match(source, /INTERNAL_TEST_IDENTITIES/);
assert.match(source, /NO_EXTERNAL_WRITES/);
assert.match(source, /transitionCount !== 1/);
assert.match(source, /engageSecurityAuditEvent\.create/);

for (const forbidden of [
  "STAGE2_GOVERNANCE_ACTIONS.rollbackRehearsal",
  "STAGE2_GOVERNANCE_ACTIONS.monitoringActive",
  "STAGE2_GOVERNANCE_ACTIONS.criticalIncidentReview",
  "STAGE2_GOVERNANCE_ACTIONS.duplicateSendReview",
  "STAGE2_GOVERNANCE_ACTIONS.scopeApproved",
  "STAGE2_GOVERNANCE_ACTIONS.authenticatedSmoke",
  "STAGE2_GOVERNANCE_ACTIONS.supportRunbookActive",
  "STAGE2_GOVERNANCE_ACTIONS.observationWindowComplete",
  "transitionControlledLaunchState",
  "engageControlledLaunchState.update",
  "engageControlledLaunchState.create",
  "engageControlledLaunchState.upsert",
  "engageControlledLaunchState.delete",
  "PHASE17_EVIDENCE_",
]) {
  assert.equal(source.includes(forbidden), false, `forbidden machine-evidence capability found: ${forbidden}`);
}

const createIndex = source.indexOf("engageSecurityAuditEvent.create");
const commitGuardIndex = source.indexOf("if (!commit)");
assert.ok(commitGuardIndex >= 0 && createIndex > commitGuardIndex, "audit create must remain behind commit guard");

console.log("PASS: engageos phase17 stage2 machine evidence policy");
