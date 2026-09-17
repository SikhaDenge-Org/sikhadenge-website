#!/usr/bin/env bash
set -Eeuo pipefail
APPLY="${APPLY:-0}"
EXPECTED_RELEASE_SHA="${EXPECTED_RELEASE_SHA:-}"
APP_DIR="${APP_DIR:-$(pwd)}"
SERVICE_NAME="${SERVICE_NAME:-sikhadenge-email-automation-scheduler}"
SYSTEMD_DIR="${SYSTEMD_DIR:-/etc/systemd/system}"
ON_CALENDAR="${ON_CALENDAR:-*:0/5}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
PREFLIGHT_EXPECTED_MODE="${EMAIL_PREFLIGHT_EXPECTED_MODE:-DRY_RUN}"

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
info() { printf 'INFO: %s\n' "$*"; }

[[ -n "$EXPECTED_RELEASE_SHA" ]] || fail "EXPECTED_RELEASE_SHA is required"
[[ "$PREFLIGHT_EXPECTED_MODE" == "DRY_RUN" || "$PREFLIGHT_EXPECTED_MODE" == "LIMITED_COHORT" ]] || fail "EMAIL_PREFLIGHT_EXPECTED_MODE must be DRY_RUN or LIMITED_COHORT"
[[ -f "$APP_DIR/package.json" && -f "$APP_DIR/scripts/email-automation-production-preflight.sh" ]] || fail "APP_DIR must be apps/whatsapp-agent-dashboard"
cd "$APP_DIR"
current_sha="$(git rev-parse HEAD 2>/dev/null || true)"
[[ "$current_sha" == "$EXPECTED_RELEASE_SHA" ]] || fail "current git SHA does not match EXPECTED_RELEASE_SHA"

unit_path="$SYSTEMD_DIR/${SERVICE_NAME}.service"
timer_path="$SYSTEMD_DIR/${SERVICE_NAME}.timer"
service_body="[Unit]
Description=SikhaDenge Email Automation Scheduler
After=network.target

[Service]
Type=oneshot
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/npm run email:automation:scheduler
Nice=10
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=$APP_DIR

[Install]
WantedBy=multi-user.target"
timer_body="[Unit]
Description=Run SikhaDenge Email Automation Scheduler every 5 minutes

[Timer]
OnCalendar=$ON_CALENDAR
Persistent=true
RandomizedDelaySec=20
Unit=${SERVICE_NAME}.service

[Install]
WantedBy=timers.target"

printf 'EMAIL_AUTOMATION_SCHEDULER_ACTIVATION_PLAN\n'
printf 'APPLY=%s\nSERVICE=%s\nTIMER=%s\nSCHEDULE=%s\nPREFLIGHT_EXPECTED_MODE=%s\n' "$APPLY" "$unit_path" "$timer_path" "$ON_CALENDAR" "$PREFLIGHT_EXPECTED_MODE"
printf '%s\n' "$service_body"
printf '%s\n' "$timer_body"

if [[ "$APPLY" != "1" ]]; then
  info "preview only; no systemd files written"
  exit 0
fi
[[ "$(id -u)" == "0" ]] || fail "APPLY=1 requires root"
command -v systemctl >/dev/null 2>&1 || fail "systemctl is required"
EMAIL_PREFLIGHT_EXPECTED_MODE="$PREFLIGHT_EXPECTED_MODE" EXPECTED_RELEASE_SHA="$EXPECTED_RELEASE_SHA" ENV_FILE="$ENV_FILE" bash scripts/email-automation-production-preflight.sh
[[ ! -e "$unit_path" && ! -e "$timer_path" ]] || fail "scheduler unit already exists; reconcile before activation"
printf '%s\n' "$service_body" > "$unit_path"
printf '%s\n' "$timer_body" > "$timer_path"
chmod 0644 "$unit_path" "$timer_path"
systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}.timer"
systemctl is-enabled "${SERVICE_NAME}.timer"
systemctl is-active "${SERVICE_NAME}.timer"
printf 'EMAIL_AUTOMATION_SCHEDULER_ACTIVATION=PASS\n'