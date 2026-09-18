// Phase17 final exact-SHA freeze after completed emergency last-working rollback — 2026-09-15
// Phase17 final exact-SHA freeze after runtime audit cleanup — 2026-09-15
// Phase17 final-lock exact-SHA trigger marker — 2026-09-15
// Machine Evidence authorized trigger — 2026-09-14
// Production provenance hardening policy — 2026-09-17
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
const workflowSource = fs.readFileSync(
  path.join(process.cwd(), "../../.github/workflows/whatsapp-agent-phase17-stage2-machine-evidence.yml"),
  "utf8",
);

assert.match(source, /RECORD_MACHINE_VERIFIED_EVIDENCE/);
assert.match(source, /STAGE2_GOVERNANCE_ACTIONS\.productionEvidence/);
assert.match(source, /STAGE2_GOVERNANCE_ACTIONS\.policyVerified/);
assert.match(source, /PHASE17_MACHINE_EVIDENCE_COMMIT/);
assert.match(source, /PHASE17_EXPECTED_LIVE_SHA/);
assert.match(source, /PHASE17_PRODUCTION_RUN_ATTEMPT/);
assert.match(source, /PHASE17_PRODUCTION_RUN_EVENT/);
assert.match(source, /PHASE17_PRODUCTION_ARTIFACT_ID/);
assert.match(source, /PHASE17_PRODUCTION_ARTIFACT_NAME/);
assert.match(source, /ALLOWED_PRODUCTION_EVENTS/);
assert.match(source, /"push", "workflow_dispatch"/);
assert.match(source, /whatsapp-agent-production-github-/);
assert.match(source, /productionWorkflowEvent/);
assert.match(source, /productionArtifactId/);
assert.match(source, /productionArtifactName/);
assert.match(source, /deployStateVerified: true/);
assert.match(source, /runtimeIdentityVerified: true/);
assert.match(source, /Tracked production worktree is not clean/);
assert.match(source, /INTERNAL_TEST_IDENTITIES/);
assert.match(source, /ONE_CONNECTED_ACCOUNT/);
assert.match(source, /NO_EXTERNAL_WRITES/);
assert.match(source, /safeStage1/);
assert.match(source, /safeStage2/);
assert.match(source, /transitionCount === 1/);
assert.match(source, /transitionCount === 2/);
assert.match(source, /enabledChannels\[0\] === "whatsapp"/);
assert.match(source, /permissionsVerified !== true/);
assert.match(source, /apiVerifiedAt/);
assert.match(source, /webhookVerifiedAt/);
assert.match(source, /engageChannelConnection\.findFirst/);
assert.match(source, /engageSecurityAuditEvent\.create/);

assert.match(workflowSource, /workflow_dispatch:/);
assert.match(workflowSource, /expected_live_sha:/);
assert.match(workflowSource, /record:/);
assert.match(workflowSource, /github\.event_name == 'workflow_dispatch'/);
assert.match(workflowSource, /inputs\.record == true/);
assert.match(workflowSource, /select\(\.event == "push" or \.event == "workflow_dispatch"\)/);
assert.doesNotMatch(workflowSource, /select\(\.event == "push"\)\]/);
assert.match(workflowSource, /actions\/runs\/\$production_run_id\/artifacts\?per_page=100/);
assert.match(workflowSource, /whatsapp-agent-production-github-\$\{production_run_id\}-\$\{production_run_attempt\}/);
assert.match(workflowSource, /production-evidence\/deploy-state\.txt/);
assert.match(workflowSource, /production-evidence\/batch-result\.txt/);
assert.match(workflowSource, /test "\$deploy_release_sha" = "\$EXPECTED_LIVE_SHA"/);
assert.match(workflowSource, /test "\$batch_release_sha" = "\$EXPECTED_LIVE_SHA"/);
assert.match(workflowSource, /test "\$batch_status" = "PASS"/);
assert.match(workflowSource, /engageos-phase17-runtime-identity-readonly\.sh/);
assert.match(workflowSource, /PHASE17_PRODUCTION_RUN_EVENT="\$PRODUCTION_RUN_EVENT"/);
assert.match(workflowSource, /PHASE17_PRODUCTION_ARTIFACT_ID="\$PRODUCTION_ARTIFACT_ID"/);
assert.match(workflowSource, /PHASE17_PRODUCTION_ARTIFACT_NAME="\$PRODUCTION_ARTIFACT_NAME"/);

const recordJobStart = workflowSource.indexOf("  record-machine-evidence:");
assert.ok(recordJobStart >= 0, "record-machine-evidence job must exist");
const recordJob = workflowSource.slice(recordJobStart);
assert.match(recordJob, /github\.event_name == 'workflow_dispatch'/);
assert.match(recordJob, /inputs\.record == true/);
assert.doesNotMatch(
  recordJob.split("    runs-on:")[0] ?? "",
  /github\.event_name == 'push'/,
  "release push must never auto-authorize machine-evidence DB writes",
);

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