#!/usr/bin/env bash
set -Eeuo pipefail
APPLY="${APPLY:-0}"
LIVE_APP="${LIVE_APP:-$(pwd)}"
ENV_FILE="${ENV_FILE:-$LIVE_APP/.env}"
PM2_PROCESS_NAME="${PM2_PROCESS_NAME:-sikhadenge-whatsapp-agent}"
BACKUP_DIR="${BACKUP_DIR:-}"
fail(){ printf 'FAIL: %s\n' "$*" >&2; exit 1; }
[[ -n "$BACKUP_DIR" && -f "$BACKUP_DIR/.env.before" ]] || fail "BACKUP_DIR with .env.before is required"
printf 'EMAIL_AUTOMATION_DRYRUN_ROLLBACK_PLAN\nAPPLY=%s\nBACKUP_DIR=%s\nENV_FILE=%s\n' "$APPLY" "$BACKUP_DIR" "$ENV_FILE"
if [[ "$APPLY" != "1" ]]; then printf 'INFO: preview only; no env or PM2 mutation performed\n'; exit 0; fi
[[ "$(id -u)" == "0" ]] || fail "APPLY=1 requires root"
cp -a "$BACKUP_DIR/.env.before" "$ENV_FILE"
pm2 restart "$PM2_PROCESS_NAME" --update-env >/dev/null
printf 'STATUS=RESTORED\nCOMPLETED_UTC=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$BACKUP_DIR/rollback-result.txt"
chmod 600 "$BACKUP_DIR/rollback-result.txt"
printf 'EMAIL_AUTOMATION_DRYRUN_ROLLBACK=PASS\n'