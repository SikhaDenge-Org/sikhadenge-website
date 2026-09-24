#!/usr/bin/env bash
set -Eeuo pipefail
ENV_FILE="${ENV_FILE:-.env}"
PM2_PROCESS_NAME="${PM2_PROCESS_NAME:-sikhadenge-whatsapp-agent}"
EXPECTED_RELEASE_SHA="${EXPECTED_RELEASE_SHA:-}"
EXPECTED_MODE="${EMAIL_PREFLIGHT_EXPECTED_MODE:-DRY_RUN}"
SCHEDULER_BASE_URL="${EMAIL_AUTOMATION_SCHEDULER_BASE_URL:-http://127.0.0.1:3100}"
SCHEDULER_PATH="/api/internal/email/automation/process"
failures=0
warnings=0
pass() { printf 'PASS: %s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*"; warnings=$((warnings + 1)); }
fail() { printf 'FAIL: %s\n' "$*"; failures=$((failures + 1)); }
read_env_value() {
  local key="$1" file="$2"
  node - "$file" "$key" <<'NODE'
const fs = require('node:fs');
const [file, key] = process.argv.slice(2);
if (!file || !key || !fs.existsSync(file)) process.exit(0);
let value = '';
for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
  const i = normalized.indexOf('=');
  if (i < 1 || normalized.slice(0, i).trim() !== key) continue;
  value = normalized.slice(i + 1).trim();
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) value = value.slice(1, -1);
}
process.stdout.write(value);
NODE
}
value_for() {
  local key="$1" persisted=""
  if [[ -f "$ENV_FILE" ]]; then persisted="$(read_env_value "$key" "$ENV_FILE")"; fi
  printf '%s' "${!key:-$persisted}"
}
printf 'EMAIL_AUTOMATION_PRODUCTION_PREFLIGHT_BEGIN\n'
printf 'UTC_TIMESTAMP=%s\nEXPECTED_MODE=%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$EXPECTED_MODE"
[[ "$EXPECTED_MODE" == "DRY_RUN" || "$EXPECTED_MODE" == "LIMITED_COHORT" || "$EXPECTED_MODE" == "LIVE" ]] || fail "EMAIL_PREFLIGHT_EXPECTED_MODE must be DRY_RUN, LIMITED_COHORT, or LIVE"
for cmd in git node npm curl pm2; do
  if command -v "$cmd" >/dev/null 2>&1; then pass "command available: $cmd"; else fail "required command missing: $cmd"; fi
done
[[ -f package.json && -f prisma/schema.prisma ]] || fail "run from apps/whatsapp-agent-dashboard"
[[ -f scripts/email-automation-deliverability-preflight.ts ]] || fail "deliverability preflight CLI is missing"
[[ -n "$EXPECTED_RELEASE_SHA" ]] || fail "EXPECTED_RELEASE_SHA is required"
current_sha="$(git rev-parse HEAD 2>/dev/null || true)"
printf 'CURRENT_GIT_SHA=%s\n' "$current_sha"
[[ -n "$EXPECTED_RELEASE_SHA" && "$current_sha" == "$EXPECTED_RELEASE_SHA" ]] && pass "deployed git SHA matches expected release" || fail "deployed git SHA does not match EXPECTED_RELEASE_SHA"
pm2_json="$(mktemp)"
trap 'rm -f "$pm2_json"' EXIT
if pm2 jlist >"$pm2_json" 2>/dev/null; then
  IFS='|' read -r pm2_status pm2_cwd pm2_port < <(node - "$PM2_PROCESS_NAME" "$pm2_json" <<'NODE'
const fs = require('node:fs');
const [name, file] = process.argv.slice(2);
const row = JSON.parse(fs.readFileSync(file, 'utf8')).find((x) => x.name === name);
if (!row) process.exit(2);
process.stdout.write([row.pm2_env?.status || '', row.pm2_env?.pm_cwd || '', row.pm2_env?.PORT || row.pm2_env?.port || '3100'].join('|'));
NODE
  ) || true
else
  pm2_status=""; pm2_cwd=""; pm2_port=""
fi
[[ "$pm2_status" == "online" ]] && pass "PM2 process online: $PM2_PROCESS_NAME" || fail "PM2 process is not online: $PM2_PROCESS_NAME"
printf 'PM2_CWD=%s\nPM2_PORT=%s\n' "$pm2_cwd" "$pm2_port"
case "$pm2_cwd" in /var/www/sikhadenge-whatsapp-agent/*) pass "PM2 cwd is inside canonical runtime root" ;; *) fail "PM2 cwd is outside canonical runtime root" ;; esac
scheduler_token="$(value_for EMAIL_AUTOMATION_SCHEDULER_TOKEN)"
runtime_enabled="$(value_for EMAIL_RUNTIME_ENABLED | tr '[:upper:]' '[:lower:]' | xargs)"
automation_enabled="$(value_for EMAIL_AUTOMATION_ENABLED | tr '[:upper:]' '[:lower:]' | xargs)"
external_writes="$(value_for EMAIL_EXTERNAL_WRITES_ENABLED | tr '[:upper:]' '[:lower:]' | xargs)"
runtime_mode="$(value_for EMAIL_RUNTIME_MODE | tr '[:lower:]' '[:upper:]' | xargs)"
cohort_allowlist="$(value_for EMAIL_AUTOMATION_COHORT_ALLOWLIST)"
if (( ${#scheduler_token} >= 32 )); then pass "scheduler token is present and meets minimum length"; else fail "scheduler token missing or shorter than 32 characters"; fi
[[ "$runtime_enabled" == "true" || "$runtime_enabled" == "1" ]] && pass "email runtime enabled" || fail "EMAIL_RUNTIME_ENABLED must be true"
[[ "$automation_enabled" == "true" || "$automation_enabled" == "1" ]] && pass "email automation enabled" || fail "EMAIL_AUTOMATION_ENABLED must be true"
if [[ "$EXPECTED_MODE" == "DRY_RUN" ]]; then
  [[ "$external_writes" == "false" || "$external_writes" == "0" || -z "$external_writes" ]] && pass "external email writes remain disabled" || fail "EMAIL_EXTERNAL_WRITES_ENABLED must remain false for DRY_RUN"
  [[ "$runtime_mode" == "DRY_RUN" ]] && pass "email runtime mode is DRY_RUN" || fail "EMAIL_RUNTIME_MODE must equal DRY_RUN"
elif [[ "$EXPECTED_MODE" == "LIMITED_COHORT" ]]; then
  [[ "$external_writes" == "true" || "$external_writes" == "1" ]] && pass "external email writes enabled for bounded cohort" || fail "EMAIL_EXTERNAL_WRITES_ENABLED must be true for LIMITED_COHORT"
  [[ "$runtime_mode" == "LIMITED_COHORT" ]] && pass "email runtime mode is LIMITED_COHORT" || fail "EMAIL_RUNTIME_MODE must equal LIMITED_COHORT"
  if node - "$cohort_allowlist" <<'NODE'
const raw=process.argv[2]||'';
const list=[...new Set(raw.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean))];
if(list.length<1||list.length>10) process.exit(1);
for(const item of list) if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)) process.exit(1);
NODE
  then pass "limited cohort allowlist is present and bounded"; else fail "EMAIL_AUTOMATION_COHORT_ALLOWLIST must contain 1-10 valid recipients"; fi
else
  [[ "$external_writes" == "true" || "$external_writes" == "1" ]] && pass "external email writes enabled for LIVE" || fail "EMAIL_EXTERNAL_WRITES_ENABLED must be true for LIVE"
  [[ "$runtime_mode" == "LIVE" ]] && pass "email runtime mode is LIVE" || fail "EMAIL_RUNTIME_MODE must equal LIVE"
fi

if [[ "$EXPECTED_MODE" == "LIMITED_COHORT" || "$EXPECTED_MODE" == "LIVE" ]]; then
  preflight_workspace="$(value_for EMAIL_DELIVERABILITY_PREFLIGHT_WORKSPACE_ID)"
  preflight_sender="$(value_for EMAIL_DELIVERABILITY_PREFLIGHT_SENDER_EMAIL)"
  if EMAIL_DELIVERABILITY_PREFLIGHT_WORKSPACE_ID="$preflight_workspace" \
    EMAIL_DELIVERABILITY_PREFLIGHT_SENDER_EMAIL="$preflight_sender" \
    npm exec -- tsx scripts/email-automation-deliverability-preflight.ts "$EXPECTED_MODE"; then
    pass "scaled-delivery persisted deliverability evidence qualified"
  else
    fail "scaled-delivery persisted deliverability evidence is not qualified"
  fi
else
  pass "deliverability guardrails are intentionally not enforced for DRY_RUN"
fi

if (( ${#scheduler_token} >= 32 )); then
  health_file="$(mktemp)"
  http_code="$(curl -sS --max-time 10 -o "$health_file" -w '%{http_code}' -H "Authorization: Bearer $scheduler_token" "${SCHEDULER_BASE_URL%/}${SCHEDULER_PATH}" || true)"
  if [[ "$http_code" == "200" ]]; then
    if node - "$health_file" "$EXPECTED_MODE" <<'NODE'
const fs = require('node:fs');
const [file, expectedMode] = process.argv.slice(2);
const h = JSON.parse(fs.readFileSync(file, 'utf8'));
if (h.runtimeMode !== expectedMode || h.automationEnabled !== true || h.runtimeEnabled !== true) process.exit(1);
if (expectedMode === 'DRY_RUN' && h.externalWritesEnabled !== false) process.exit(1);
if ((expectedMode === 'LIMITED_COHORT' || expectedMode === 'LIVE') && h.externalWritesEnabled !== true) process.exit(1);
NODE
    then pass "protected scheduler health agrees with required $EXPECTED_MODE state"; else fail "scheduler health does not match required $EXPECTED_MODE safety state"; fi
  else
    fail "protected scheduler health endpoint returned HTTP ${http_code:-unreachable}"
  fi
  rm -f "$health_file"
fi
existing_refs=0
if command -v systemctl >/dev/null 2>&1; then
  existing_refs=$((existing_refs + $(systemctl list-unit-files --no-legend 2>/dev/null | grep -ci 'email-automation-scheduler' || true)))
  existing_refs=$((existing_refs + $(systemctl list-timers --all --no-legend 2>/dev/null | grep -ci 'email-automation-scheduler' || true)))
fi
if command -v crontab >/dev/null 2>&1; then existing_refs=$((existing_refs + $(crontab -l 2>/dev/null | grep -ci 'email:automation:scheduler\|email-automation-scheduler-call' || true))); fi
if [[ -d /etc/cron.d ]]; then existing_refs=$((existing_refs + $( (grep -RliE 'email:automation:scheduler|email-automation-scheduler-call' /etc/cron.d 2>/dev/null || true) | wc -l | xargs))); fi
printf 'EXISTING_SCHEDULER_REFERENCES=%s\n' "$existing_refs"
[[ "$existing_refs" == "0" ]] && pass "no duplicate scheduler wiring detected" || fail "existing scheduler wiring detected; reconcile before activation"
printf 'WARNINGS=%s\nFAILURES=%s\n' "$warnings" "$failures"
if (( failures > 0 )); then printf 'EMAIL_AUTOMATION_PRODUCTION_PREFLIGHT=FAIL\n'; exit 1; fi
printf 'EMAIL_AUTOMATION_PRODUCTION_PREFLIGHT=PASS\n'