#!/usr/bin/env bash
set -Eeuo pipefail
APPLY="${APPLY:-0}"
LIVE_APP="${LIVE_APP:-$(pwd)}"
ENV_FILE="${ENV_FILE:-$LIVE_APP/.env}"
EXPECTED_RELEASE_SHA="${EXPECTED_RELEASE_SHA:-}"
BACKUP_ROOT="${BACKUP_ROOT:-/root/sikhadenge-backups}"
RUN_ID="${RUN_ID:-email-dryrun-activation-$(date -u +%Y%m%dT%H%M%SZ)}"
BACKUP_DIR="$BACKUP_ROOT/$RUN_ID"
SERVICE_NAME="${SERVICE_NAME:-sikhadenge-email-automation-scheduler}"
MAX_FAILED_EVENTS="${MAX_FAILED_EVENTS:-0}"
fail(){ printf 'FAIL: %s\n' "$*" >&2; exit 1; }
[[ -n "$EXPECTED_RELEASE_SHA" ]] || fail "EXPECTED_RELEASE_SHA is required"
cd "$LIVE_APP"
[[ "$(git rev-parse HEAD 2>/dev/null || true)" == "$EXPECTED_RELEASE_SHA" ]] || fail "git SHA mismatch"
printf 'EMAIL_AUTOMATION_DRYRUN_ACTIVATION_PLAN\nAPPLY=%s\nRUN_ID=%s\nBACKUP_DIR=%s\n' "$APPLY" "$RUN_ID" "$BACKUP_DIR"
printf 'SEQUENCE=provision,reconcile-scheduler,preflight,activate,first-run,verify\nEXTERNAL_WRITES=false\nRUNTIME_MODE=DRY_RUN\n'
if [[ "$APPLY" != "1" ]]; then printf 'INFO: preview only; no env, PM2, or systemd mutation performed\n'; exit 0; fi
[[ "$(id -u)" == "0" ]] || fail "APPLY=1 requires root"
install -d -m 700 "$BACKUP_DIR"
rollback(){
  code=$?
  trap - ERR
  APPLY=1 SERVICE_NAME="$SERVICE_NAME" bash scripts/email-automation-scheduler-deactivate.sh >/dev/null 2>&1 || true
  if [[ -f "$BACKUP_DIR/.env.before" ]]; then
    APPLY=1 LIVE_APP="$LIVE_APP" ENV_FILE="$ENV_FILE" BACKUP_DIR="$BACKUP_DIR" bash scripts/email-automation-dryrun-rollback.sh >/dev/null 2>&1 || true
  fi
  printf 'STATUS=ROLLED_BACK_AFTER_FAILURE\nFAILED_EXIT_CODE=%s\n' "$code" > "$BACKUP_DIR/activation-result.txt" || true
  chmod 600 "$BACKUP_DIR/activation-result.txt" 2>/dev/null || true
  exit "$code"
}
trap rollback ERR
APPLY=1 LIVE_APP="$LIVE_APP" ENV_FILE="$ENV_FILE" EXPECTED_RELEASE_SHA="$EXPECTED_RELEASE_SHA" BACKUP_ROOT="$BACKUP_ROOT" RUN_ID="$RUN_ID" bash scripts/email-automation-dryrun-provision.sh | tee "$BACKUP_DIR/provision.log"
# Reconcile stale/disabled unit files before the read-only preflight checks for duplicate scheduler wiring.
APPLY=1 SERVICE_NAME="$SERVICE_NAME" bash scripts/email-automation-scheduler-deactivate.sh | tee "$BACKUP_DIR/reconcile-scheduler.log"
EXPECTED_RELEASE_SHA="$EXPECTED_RELEASE_SHA" ENV_FILE="$ENV_FILE" bash scripts/email-automation-production-preflight.sh | tee "$BACKUP_DIR/preflight.log"
APPLY=1 APP_DIR="$LIVE_APP" ENV_FILE="$ENV_FILE" EXPECTED_RELEASE_SHA="$EXPECTED_RELEASE_SHA" SERVICE_NAME="$SERVICE_NAME" bash scripts/email-automation-scheduler-activate.sh | tee "$BACKUP_DIR/activate.log"
if ! systemctl start "${SERVICE_NAME}.service"; then
  systemctl status "${SERVICE_NAME}.service" --no-pager > "$BACKUP_DIR/first-run-status.log" 2>&1 || true
  journalctl -u "${SERVICE_NAME}.service" -n 100 --no-pager > "$BACKUP_DIR/first-run.log" 2>&1 || true
  printf 'FAIL: first scheduler service run failed\n' >&2
  false
fi
systemctl is-failed --quiet "${SERVICE_NAME}.service" && fail "first scheduler service run failed" || true
journalctl -u "${SERVICE_NAME}.service" -n 100 --no-pager > "$BACKUP_DIR/first-run.log" 2>&1 || true
EXPECTED_RELEASE_SHA="$EXPECTED_RELEASE_SHA" ENV_FILE="$ENV_FILE" SERVICE_NAME="$SERVICE_NAME" MAX_FAILED_EVENTS="$MAX_FAILED_EVENTS" bash scripts/email-automation-scheduler-verify.sh | tee "$BACKUP_DIR/verify.log"
systemctl show "${SERVICE_NAME}.timer" --no-pager -p ActiveState -p UnitFileState -p LastTriggerUSec > "$BACKUP_DIR/systemd-timer.txt"
printf 'RUN_ID=%s\nEXPECTED_RELEASE_SHA=%s\nSTATUS=PASS\nRUNTIME_MODE=DRY_RUN\nEXTERNAL_WRITES=false\nSCHEDULER_RECONCILED=true\nCOMPLETED_UTC=%s\n' "$RUN_ID" "$EXPECTED_RELEASE_SHA" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$BACKUP_DIR/activation-result.txt"
chmod 600 "$BACKUP_DIR"/*
trap - ERR
printf 'EMAIL_AUTOMATION_DRYRUN_ACTIVATION=PASS\nEVIDENCE_DIR=%s\n' "$BACKUP_DIR"
