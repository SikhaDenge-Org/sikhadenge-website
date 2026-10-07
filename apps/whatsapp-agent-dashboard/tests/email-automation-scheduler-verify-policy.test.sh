#!/usr/bin/env bash
set -Eeuo pipefail
verify="scripts/email-automation-scheduler-verify.sh"
test -f "$verify"
bash -n "$verify"
grep -Fq 'EXPECTED_RELEASE_SHA is required' "$verify"
grep -Fq 'systemctl is-enabled' "$verify"
grep -Fq 'systemctl is-active' "$verify"
grep -Fq 'LastTriggerUSec' "$verify"
grep -Fq 'runtimeMode' "$verify"
grep -Fq "DRY_RUN" "$verify"
grep -Fq 'externalWritesEnabled' "$verify"
grep -Fq 'latestSchedulerRun' "$verify"
grep -Fq 'MAX_RUN_AGE_SECONDS' "$verify"
grep -Fq 'MAX_FAILED_EVENTS' "$verify"
grep -Fq 'EMAIL_AUTOMATION_SCHEDULER_VERIFY=PASS' "$verify"
if grep -Eqi 'systemctl (enable|disable|start|stop|restart)|rm -f /etc/systemd|EMAIL_RUNTIME_MODE=LIVE|EMAIL_EXTERNAL_WRITES_ENABLED=true|prisma migrate|INSERT[[:space:]]+INTO|UPDATE[[:space:]]+' "$verify"; then
  printf 'Post-activation verifier must remain read-only.\n' >&2
  exit 1
fi
printf 'Email automation scheduler post-activation verification policy: PASS\n'