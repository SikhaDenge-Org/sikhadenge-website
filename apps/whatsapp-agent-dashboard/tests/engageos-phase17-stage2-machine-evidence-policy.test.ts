// Phase17 final exact-SHA freeze after runtime audit cleanup — 2026-09-15
// Phase17 final-lock exact-SHA trigger marker — 2026-09-15
// Machine Evidence authorized trigger — 2026-09-14
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "scripts/engageos-phase17-stage2-record-machine-evidence.ts"),
  "utf8",
);
const governanceSource = fs.readFileSync(
  path.join(process.cwd(), "modules/release/application/phase17-stage2-governance-evidence.ts"),
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

const expectedGovernanceActions = {
  productionEvidence: "PHASE17_PRODUCTION_EVIDENCE_RECORDED",
  rollbackRehearsal: "PHASE17_ROLLBACK_REHEARSAL",
  monitoringActive: "PHASE17_MONITORING_ACTIVE",
  policyVerified: "PHASE17_POLICY_VERIFIED",
  criticalIncidentReview: "PHASE17_CRITICAL_INCIDENT_REVIEW",
  duplicateSendReview: "PHASE17_DUPLICATE_SEND_REVIEW",
  scopeApproved: "PHASE17_STAGE2_SCOPE_APPROVED",
  authenticatedSmoke: "PHASE17_AUTHENTICATED_SMOKE",
  supportRunbookActive: "PHASE17_SUPPORT_RUNBOOK_ACTIVE",
  observationWindowComplete: "PHASE17_OBSERVATION_WINDOW_COMPLETE",
} as const;

for (const [key, action] of Object.entries(expectedGovernanceActions)) {
  assert.match(
    governanceSource,
    new RegExp(`${key}:\\s*["']${action}["']`),
    `governance action contract drifted: ${key}`,
  );
}

const declaredGovernanceActionKeys = [
  ...governanceSource.matchAll(/^\s{2}([A-Za-z0-9_]+):\s*["']PHASE17_[A-Z0-9_]+["'],?$/gm),
].map((match) => match[1]);
assert.deepEqual(
  declaredGovernanceActionKeys.sort(),
  Object.keys(expectedGovernanceActions).sort(),
  "Stage2 governance action set must remain the exact reviewed 10-gate contract",
);

const recordsMatch = source.match(/const records = \[([\s\S]*?)\]\s+as const;/);
assert.ok(recordsMatch, "machine-evidence records block must remain statically inspectable");
const recordsBlock = recordsMatch[1];
const machineActionKeys = [...recordsBlock.matchAll(/action:\s*STAGE2_GOVERNANCE_ACTIONS\.([A-Za-z0-9_]+)/g)].map(
  (match) => match[1],
);
assert.deepEqual(
  machineActionKeys,
  ["productionEvidence", "policyVerified"],
  "machine recorder may attest exactly productionEvidence + policyVerified, in that order",
);
assert.equal(
  (recordsBlock.match(/\baction\s*:/g) ?? []).length,
  2,
  "machine recorder records block must contain exactly two action entries",
);

const forbiddenMachineActionKeys = [
  "rollbackRehearsal",
  "monitoringActive",
  "criticalIncidentReview",
  "duplicateSendReview",
  "scopeApproved",
  "authenticatedSmoke",
  "supportRunbookActive",
  "observationWindowComplete",
] as const;

for (const key of forbiddenMachineActionKeys) {
  const action = expectedGovernanceActions[key];
  assert.equal(
    recordsBlock.includes(`STAGE2_GOVERNANCE_ACTIONS.${key}`),
    false,
    `operator/operational evidence gate leaked into machine recorder: ${key}`,
  );
  assert.equal(
    recordsBlock.includes(action),
    false,
    `raw governance action literal leaked into machine recorder: ${action}`,
  );
}

for (const forbidden of [
  "transitionControlledLaunchState",
  "engageControlledLaunchState.update",
  "engageControlledLaunchState.create",
  "engageControlledLaunchState.upsert",
  "engageControlledLaunchState.delete",
  "PHASE17_EVIDENCE_",
]) {
  assert.equal(source.includes(forbidden), false, `forbidden machine-evidence capability found: ${forbidden}`);
}

assert.equal(
  (source.match(/engageSecurityAuditEvent\.create/g) ?? []).length,
  1,
  "machine recorder must retain a single audited write path",
);
const createIndex = source.indexOf("engageSecurityAuditEvent.create");
const commitGuardIndex = source.indexOf("if (!commit)");
assert.ok(commitGuardIndex >= 0 && createIndex > commitGuardIndex, "audit create must remain behind commit guard");

console.log("PASS: engageos phase17 stage2 machine evidence policy");
