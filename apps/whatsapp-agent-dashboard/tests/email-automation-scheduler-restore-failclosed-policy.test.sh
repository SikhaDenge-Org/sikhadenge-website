#!/usr/bin/env bash
set -Eeuo pipefail

dryrun_workflow="../../.github/workflows/whatsapp-agent-email-dryrun-activation.yml"
dryrun_script="scripts/email-automation-production-dryrun-activate.sh"
internal_script="scripts/email-automation-production-internal-test.sh"

for file in "$dryrun_workflow" "$dryrun_script" "$internal_script"; do
  test -f "$file" || { echo "Missing scheduler restore policy source: $file" >&2; exit 1; }
done

for marker in   'REQUESTED_DEPLOYED_SHA'   'DEPLOYED_SHA="$(git rev-parse HEAD)"'   'CERTIFIED_RELEASE_SHA'   'CERTIFIED_BUILD_ID'   'CERTIFIED_PM2_STATUS'   'CERTIFIED_PM2_CWD'   'LIVE_PM2_STATUS'; do
  grep -Fq "$marker" "$dryrun_workflow" || {
    echo "Missing DRY_RUN live-runtime identity contract: $marker" >&2
    exit 1
  }
done

if grep -Fq 'github.event.before' "$dryrun_workflow"; then
  echo "DRY_RUN activation must not infer production runtime identity from github.event.before." >&2
  exit 1
fi

for marker in   'SEQUENCE=provision,preflight,reconcile-scheduler,activate,first-run,verify'   'reconcile-scheduler.log'   'email-automation-scheduler-deactivate.sh'   'email-automation-scheduler-activate.sh'   'SCHEDULER_RECONCILED=true'; do
  grep -Fq "$marker" "$dryrun_script" || {
    echo "Missing idempotent scheduler activation contract: $marker" >&2
    exit 1
  }
done

for marker in   'pre-test scheduler timer must be enabled'   'pre-test scheduler timer must be active'   'restore-scheduler-activate.log'   'restore-scheduler-verify.log'   'POST_TEST_RUNTIME_MODE=DRY_RUN'   'POST_TEST_EXTERNAL_WRITES=false'   'POST_TEST_SCHEDULER_ENABLED=true'   'POST_TEST_SCHEDULER_ACTIVE=true'   'final_code=70'; do
  grep -Fq "$marker" "$internal_script" || {
    echo "Missing fail-closed internal-test restore contract: $marker" >&2
    exit 1
  }
done

if grep -F 'email-automation-scheduler-activate.sh' "$internal_script" | grep -Fq '|| true'; then
  echo "Internal Email test must not ignore scheduler reactivation failure." >&2
  exit 1
fi

echo "Email scheduler restore fail-closed policy: PASS"
