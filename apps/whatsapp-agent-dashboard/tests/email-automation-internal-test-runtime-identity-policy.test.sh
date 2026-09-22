#!/usr/bin/env bash
set -Eeuo pipefail

internal_workflow="../../.github/workflows/whatsapp-agent-email-internal-test.yml"
dryrun_workflow="../../.github/workflows/whatsapp-agent-email-dryrun-activation.yml"

test -f "$internal_workflow"
test -f "$dryrun_workflow"

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

echo "Email production live runtime identity and DRY_RUN fail-closed policy: PASS"
