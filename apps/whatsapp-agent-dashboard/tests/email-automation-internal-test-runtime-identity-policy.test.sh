#!/usr/bin/env bash
set -Eeuo pipefail

internal_workflow="../../.github/workflows/whatsapp-agent-email-internal-test.yml"
dryrun_workflow="../../.github/workflows/whatsapp-agent-email-dryrun-activation.yml"
internal_script="../scripts/email-automation-production-internal-test.sh"

test -f "$internal_workflow"
test -f "$dryrun_workflow"
test -f "$internal_script"

internal_required=(
  'REQUESTED_DEPLOYED_SHA'
  'DEPLOYED_SHA="$(git rev-parse HEAD)"'
  'CERTIFIED_RELEASE_SHA'
  'CERTIFIED_BUILD_ID'
  'CERTIFIED_PM2_STATUS'
  'CERTIFIED_PM2_CWD'
  'LIVE_PM2_STATUS'
  'EMAIL_INTERNAL_TEST_RECIPIENT="ankitsingh@sikhadenge.in"'
  'EMAIL_INTERNAL_TEST_SENDER="support@sikhadenge.in"'
)

for marker in "${internal_required[@]}"; do
  grep -Fq "$marker" "$internal_workflow" || {
    echo "Missing internal-test runtime identity contract: $marker" >&2
    exit 1
  }
done

if grep -Fq 'github.event.before' "$internal_workflow"; then
  echo "Internal Email test must not infer production runtime identity from github.event.before." >&2
  exit 1
fi

internal_workflow_restore_required=(
  'Reconcile post-test runtime to verified DRY_RUN'
  'bash scripts/email-automation-production-dryrun-activate.sh'
  'bash scripts/email-automation-scheduler-verify.sh'
  'POST_TEST_DRYRUN_RECONCILE=PASS'
  'RUNTIME_MODE=DRY_RUN'
  'EXTERNAL_WRITES=false'
  'SCHEDULER_ACTIVE=true'
  'email-internal-post-test-restore.log'
)

for marker in "${internal_workflow_restore_required[@]}"; do
  grep -Fq "$marker" "$internal_workflow" || {
    echo "Missing internal-test workflow post-test DRY_RUN restore contract: $marker" >&2
    exit 1
  }
done

if ! awk '/- name: Reconcile post-test runtime to verified DRY_RUN/{getline; if($0 ~ /if: always\(\)/) found=1} END{exit found?0:1}' "$internal_workflow"; then
  echo "Internal Email workflow post-test DRY_RUN reconciliation must run with if: always()." >&2
  exit 1
fi

internal_script_required=(
  'sync_pm2_email_env_from_file'
  'APPLY=1 bash scripts/email-automation-scheduler-deactivate.sh'
  'bash scripts/email-automation-scheduler-activate.sh'
  'bash scripts/email-automation-scheduler-verify.sh'
  'STATUS=PASS_POST_TEST_DRY_RUN_RESTORED'
  'RESTORE_VERIFICATION=PASS'
  'STATUS=FAILED_POST_TEST_DRY_RUN_RESTORE_VERIFICATION'
  'RESTORE_EXIT_CODE='
  'final_code=97'
)

for marker in "${internal_script_required[@]}"; do
  grep -Fq "$marker" "$internal_script" || {
    echo "Missing internal-test verified restore contract: $marker" >&2
    exit 1
  }
done

if grep -Fq 'bash scripts/email-automation-scheduler-deactivate.sh >/dev/null 2>&1 || true' "$internal_script"; then
  echo "Internal Email test must not preview-only or swallow scheduler deactivation failures." >&2
  exit 1
fi

if grep -Fq 'pm2 restart "$PM2_PROCESS_NAME" --update-env >/dev/null 2>&1 || true' "$internal_script"; then
  echo "Internal Email test must not swallow PM2 restore failures." >&2
  exit 1
fi

dryrun_required=(
  'DEPLOYED_SHA="$(git rev-parse HEAD)"'
  'CERTIFIED_RELEASE_SHA'
  'CERTIFIED_BUILD_ID'
  'CERTIFIED_PM2_STATUS'
  'CERTIFIED_PM2_CWD'
  'APPLY=1 SERVICE_NAME="$SERVICE_NAME" bash scripts/email-automation-scheduler-deactivate.sh'
  'bash scripts/email-automation-production-dryrun-activate.sh'
  'bash scripts/email-automation-scheduler-verify.sh'
  'EMAIL_DRYRUN_RECONCILE_FALLBACK=DRY_RUN_EXTERNAL_WRITES_OFF'
  'EMAIL_AUTOMATION_ENABLED=false'
  'EMAIL_RUNTIME_MODE=DRY_RUN'
  'EMAIL_EXTERNAL_WRITES_ENABLED=false'
  'EMAIL_DRYRUN_RECONCILE=PASS'
)

for marker in "${dryrun_required[@]}"; do
  grep -Fq "$marker" "$dryrun_workflow" || {
    echo "Missing DRY_RUN live-runtime safety contract: $marker" >&2
    exit 1
  }
done

if grep -Fq 'github.event.before' "$dryrun_workflow"; then
  echo "DRY_RUN activation must not infer production runtime identity from github.event.before." >&2
  exit 1
fi

echo "Email production live runtime identity, verified internal restore, and DRY_RUN fail-closed policy: PASS"
