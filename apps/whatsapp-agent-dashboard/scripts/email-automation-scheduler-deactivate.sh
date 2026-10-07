#!/usr/bin/env bash
set -Eeuo pipefail
APPLY="${APPLY:-0}"
SERVICE_NAME="${SERVICE_NAME:-sikhadenge-email-automation-scheduler}"
SYSTEMD_DIR="${SYSTEMD_DIR:-/etc/systemd/system}"
unit_path="$SYSTEMD_DIR/${SERVICE_NAME}.service"
timer_path="$SYSTEMD_DIR/${SERVICE_NAME}.timer"
printf 'EMAIL_AUTOMATION_SCHEDULER_DEACTIVATION_PLAN\nAPPLY=%s\nSERVICE=%s\nTIMER=%s\n' "$APPLY" "$unit_path" "$timer_path"
if [[ "$APPLY" != "1" ]]; then printf 'INFO: preview only; no mutation performed\n'; exit 0; fi
[[ "$(id -u)" == "0" ]] || { printf 'FAIL: APPLY=1 requires root\n' >&2; exit 1; }
if command -v systemctl >/dev/null 2>&1; then
  systemctl disable --now "${SERVICE_NAME}.timer" 2>/dev/null || true
  systemctl stop "${SERVICE_NAME}.service" 2>/dev/null || true
fi
rm -f "$timer_path" "$unit_path"
if command -v systemctl >/dev/null 2>&1; then systemctl daemon-reload; fi
printf 'EMAIL_AUTOMATION_SCHEDULER_DEACTIVATION=PASS\n'