#!/usr/bin/env bash
set -Eeuo pipefail
f="scripts/email-automation-production-dryrun-activate.sh"
test -f "$f"
bash -n "$f"
grep -Fq 'APPLY="${APPLY:-0}"' "$f"
grep -Fq 'preview only; no env, PM2, or systemd mutation performed' "$f"
grep -Fq 'APPLY=1 requires root' "$f"
grep -Fq 'email-automation-dryrun-provision.sh' "$f"
grep -Fq 'SEQUENCE=provision,reconcile-scheduler,preflight,activate,first-run,verify' "$f"
grep -Fq 'reconcile-scheduler.log' "$f"
grep -Fq 'email-automation-production-preflight.sh' "$f"
grep -Fq 'email-automation-scheduler-activate.sh' "$f"
grep -Fq 'systemctl start "${SERVICE_NAME}.service"' "$f"
grep -Fq 'journalctl -u "${SERVICE_NAME}.service"' "$f"
grep -Fq 'email-automation-scheduler-verify.sh' "$f"
grep -Fq 'email-automation-scheduler-deactivate.sh' "$f"
grep -Fq 'email-automation-dryrun-rollback.sh' "$f"
grep -Fq 'STATUS=ROLLED_BACK_AFTER_FAILURE' "$f"
grep -Fq 'SCHEDULER_RECONCILED=true' "$f"
grep -Fq 'RUNTIME_MODE=DRY_RUN' "$f"
grep -Fq 'EXTERNAL_WRITES=false' "$f"
if grep -Fq 'EMAIL_RUNTIME_MODE=LIVE' "$f" || grep -Fq 'EMAIL_EXTERNAL_WRITES_ENABLED=true' "$f"; then echo 'Orchestrator must never enable LIVE/external writes.' >&2; exit 1; fi
echo 'Email automation production DRY_RUN activation policy: PASS'