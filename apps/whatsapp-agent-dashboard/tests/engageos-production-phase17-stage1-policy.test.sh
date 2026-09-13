#!/usr/bin/env bash
set -Eeuo pipefail

script_root="scripts"
batch="$script_root/engageos-production-batch1.sh"
migrate="$script_root/engageos-production-migrate-v2.sh"
lineage="$script_root/engageos-production-dynamic-lineage-readonly.sh"
bootstrap="$script_root/engageos-production-phase17-stage1-bootstrap.sh"
bootstrap_ts="$script_root/engageos-phase17-stage1-bootstrap.ts"
verify="$script_root/engageos-production-phase17-stage1-verify.sh"
readiness="$script_root/engageos-phase17-production-readiness.sh"

for script in "$migrate" "$lineage" "$bootstrap" "$verify" "$batch"; do
  test -f "$script"
  bash -n "$script"
done
test -f "$bootstrap_ts"
test -f "$readiness"

# Read-only retry gate must recognize the target release dynamically without mutating the DB.
grep -Fq 'find "$STAGE_APP/prisma/migrations"' "$lineage"
grep -Fq 'DYNAMIC_LINEAGE_UNKNOWN_APPLIED_COUNT' "$lineage"
grep -Fq 'DYNAMIC_LINEAGE_PENDING_REPO_COUNT' "$lineage"
grep -Fq 'PASS: DYNAMIC_READONLY_MIGRATION_LINEAGE_VERIFIED' "$lineage"
if grep -Eqi 'prisma migrate deploy|prisma migrate resolve|INSERT[[:space:]]+INTO|UPDATE[[:space:]]+|DELETE[[:space:]]+FROM|ALTER[[:space:]]+TABLE|DROP[[:space:]]+TABLE' "$lineage"; then
  printf 'Dynamic lineage preflight must remain read-only.\n' >&2
  exit 1
fi

# Dynamic migration lineage must recognize every committed migration and deploy head-only additions.
grep -Fq 'find prisma/migrations' "$migrate"
grep -Fq 'recognized_before=' "$migrate"
grep -Fq 'unknown_before=' "$migrate"
grep -Fq 'npx prisma migrate deploy' "$migrate"
grep -Fq '20260913113000_add_phase17_controlled_launch_state' "$migrate"
grep -Fq 'EngageControlledLaunchState' "$migrate"
grep -Fq 'EngageControlledLaunchTransition' "$migrate"
grep -Fq 'PASS: ENGAGEOS_DYNAMIC_MIGRATION_VERIFIED_FLAGS_OFF' "$migrate"

# Bootstrap must call the tested application service/repository; direct SQL bootstrap is forbidden.
grep -Fq 'bootstrapStage1ControlledLaunch' "$bootstrap_ts"
grep -Fq 'prismaControlledLaunchStateRepository' "$bootstrap_ts"
grep -Fq 'EXPECTED_WORKSPACE_ID = "engagews_default"' "$bootstrap_ts"
grep -Fq 'INTERNAL_TEST_IDENTITIES' "$bootstrap_ts"
grep -Fq 'SHADOW' "$bootstrap_ts"
grep -Fq 'NO_EXTERNAL_WRITES' "$bootstrap_ts"
grep -Fq 'PHASE17_STAGE1_TRANSITION_COUNT' "$bootstrap_ts"
if grep -Eqi 'INSERT[[:space:]]+INTO|UPDATE[[:space:]]+"EngageControlledLaunch|DELETE[[:space:]]+FROM' "$bootstrap_ts"; then
  printf 'Stage1 bootstrap helper must not bypass the controlled-launch repository with direct mutation SQL.\n' >&2
  exit 1
fi

grep -Fq 'test "$WORKSPACE_ID" = "engagews_default"' "$bootstrap"
grep -Fq 'ENGAGEOS_STAGE1_RELEASE_SHA' "$bootstrap"
grep -Fq 'npx tsx scripts/engageos-phase17-stage1-bootstrap.ts' "$bootstrap"

# Independent verifier must fail closed on exact Stage1 state/history and disabled safety flags.
grep -Fq 'INTERNAL_TEST_IDENTITIES|SHADOW|NO_EXTERNAL_WRITES|false|1|0|false' "$verify"
grep -Fq 'IS NULL THEN' "$verify"
grep -Fq 'PHASE17_STAGE1_PERSISTENCE=PASS' "$verify"
grep -Fq 'FEATURE_FLAGS_ENABLED' "$verify"
grep -Fq '/login' "$verify"

# Orchestrator must reconcile legacy preflight through the dynamic read-only gate,
# always execute the dynamic migration, and bootstrap only after post-deploy rollback evidence.
grep -Fq 'engageos-production-dynamic-lineage-readonly.sh' "$batch"
grep -Fq 'PREFLIGHT_DYNAMIC_LINEAGE_COMPATIBILITY_VERIFIED' "$batch"
grep -Fq 'engageos-production-migrate-v2.sh' "$batch"
grep -Fq 'engageos-production-phase17-stage1-bootstrap.sh' "$batch"
grep -Fq 'engageos-phase17-production-readiness.sh' "$batch"
grep -Fq 'engageos-production-phase17-stage1-verify.sh' "$batch"

lineage_line="$(grep -nF 'engageos-production-dynamic-lineage-readonly.sh' "$batch" | head -n1 | cut -d: -f1)"
migration_line="$(grep -nF 'engageos-production-migrate-v2.sh' "$batch" | head -n1 | cut -d: -f1)"
verify_line="$(grep -nF 'engageos-production-verify.sh' "$batch" | head -n1 | cut -d: -f1)"
rollback_evidence_line="$(grep -nF 'PASS: ROLLBACK_ARTIFACTS_PRESERVED' "$batch" | head -n1 | cut -d: -f1)"
bootstrap_line="$(grep -nF 'engageos-production-phase17-stage1-bootstrap.sh' "$batch" | head -n1 | cut -d: -f1)"
state_verify_line="$(grep -nF 'engageos-production-phase17-stage1-verify.sh' "$batch" | head -n1 | cut -d: -f1)"

test -n "$lineage_line"
test -n "$migration_line"
test -n "$verify_line"
test -n "$rollback_evidence_line"
test -n "$bootstrap_line"
test -n "$state_verify_line"
test "$lineage_line" -lt "$migration_line"
test "$migration_line" -lt "$verify_line"
test "$verify_line" -lt "$rollback_evidence_line"
test "$rollback_evidence_line" -lt "$bootstrap_line"
test "$bootstrap_line" -lt "$state_verify_line"

# Existing read-only readiness must run after bootstrap to reconfirm SHA/migrations/flags/PM2/login.
# It must execute from LIVE_APP because STAGE_APP is intentionally mutated by isolated build tooling.
readiness_line="$(grep -nF 'engageos-phase17-production-readiness.sh' "$batch" | tail -n1 | cut -d: -f1)"
readiness_worktree_line="$(grep -nF 'PHASE17_STAGE1_READINESS_WORKTREE=%s' "$batch" | tail -n1 | cut -d: -f1)"
live_cd_line="$(grep -nF 'cd "$LIVE_APP"' "$batch" | tail -n1 | cut -d: -f1)"
test -n "$readiness_worktree_line"
test -n "$live_cd_line"
test "$bootstrap_line" -lt "$readiness_worktree_line"
test "$readiness_worktree_line" -lt "$live_cd_line"
test "$live_cd_line" -lt "$readiness_line"
test "$readiness_line" -lt "$state_verify_line"

printf 'EngageOS Phase17 Stage1 production activation policy: PASS\n'