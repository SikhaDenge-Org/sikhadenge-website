#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE="${ENV_FILE:-.env}"
PM2_PROCESS_NAME="${PM2_PROCESS_NAME:-sikhadenge-whatsapp-agent}"
failures=0

pass() { printf 'PASS: %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; failures=$((failures + 1)); }

read_env_value() {
  local key="$1"
  local file="$2"
  node - "$file" "$key" <<'NODE'
const fs = require('node:fs');
const [file, key] = process.argv.slice(2);
if (!file || !key || !fs.existsSync(file)) process.exit(0);
const text = fs.readFileSync(file, 'utf8');
let value = '';
for (const rawLine of text.split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
  const separator = normalized.indexOf('=');
  if (separator < 1) continue;
  if (normalized.slice(0, separator).trim() !== key) continue;
  value = normalized.slice(separator + 1).trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1);
  }
}
process.stdout.write(value);
NODE
}

PM2_JSON=""
if command -v pm2 >/dev/null 2>&1; then
  PM2_JSON="$(pm2 jlist 2>/dev/null || true)"
fi

read_pm2_env_value() {
  local key="$1"
  if [[ -z "$PM2_JSON" ]]; then
    return 0
  fi
  printf '%s' "$PM2_JSON" | node -e '
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  const [processName, key] = process.argv.slice(1);
  try {
    const rows = JSON.parse(input || "[]");
    const row = rows.find((item) => item?.name === processName || item?.pm2_env?.name === processName);
    const value = row?.pm2_env?.[key];
    if (value !== undefined && value !== null) process.stdout.write(String(value));
  } catch {
    process.exit(0);
  }
});
' "$PM2_PROCESS_NAME" "$key"
}

normalize() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | xargs
}

source_value() {
  local key="$1"
  local source="$2"
  case "$source" in
    env-file)
      read_env_value "$key" "$ENV_FILE"
      ;;
    shell)
      if [[ -v "$key" ]]; then
        printf '%s' "${!key}"
      fi
      ;;
    pm2)
      read_pm2_env_value "$key"
      ;;
  esac
}

assert_false_or_absent() {
  local key="$1"
  local source value normalized unsafe=0
  for source in env-file shell pm2; do
    value="$(source_value "$key" "$source")"
    normalized="$(normalize "$value")"
    case "$normalized" in
      ''|false|0|off|no) ;;
      *)
        fail "$key is enabled in $source; it must be absent or disabled for the initial EngageOS production deploy"
        unsafe=1
        ;;
    esac
  done
  if [[ "$unsafe" -eq 0 ]]; then
    pass "$key is fail-closed across env-file, shell and PM2"
  fi
}

assert_exact_or_absent() {
  local key="$1"
  local expected="$2"
  local source value normalized unsafe=0
  for source in env-file shell pm2; do
    value="$(source_value "$key" "$source")"
    normalized="$(normalize "$value")"
    if [[ -n "$normalized" && "$normalized" != "$expected" ]]; then
      fail "$key is unsafe in $source; it must be absent or $expected for the initial EngageOS production deploy"
      unsafe=1
    fi
  done
  if [[ "$unsafe" -eq 0 ]]; then
    pass "$key is $expected or absent across env-file, shell and PM2"
  fi
}

assert_empty_or_absent() {
  local key="$1"
  local source value unsafe=0
  for source in env-file shell pm2; do
    value="$(source_value "$key" "$source")"
    if [[ -n "$(printf '%s' "$value" | xargs)" ]]; then
      fail "$key is populated in $source; it must be empty or absent for the initial EngageOS production deploy"
      unsafe=1
    fi
  done
  if [[ "$unsafe" -eq 0 ]]; then
    pass "$key is empty or absent across env-file, shell and PM2"
  fi
}

assert_on_or_absent() {
  local key="$1"
  local source value normalized unsafe=0
  for source in env-file shell pm2; do
    value="$(source_value "$key" "$source")"
    normalized="$(normalize "$value")"
    case "$normalized" in
      ''|on|true|1) ;;
      *)
        fail "$key is not protective in $source; it must be absent or protective for the initial EngageOS production deploy"
        unsafe=1
        ;;
    esac
  done
  if [[ "$unsafe" -eq 0 ]]; then
    pass "$key is protective or absent across env-file, shell and PM2"
  fi
}

printf 'ENGAGEOS_HIGH_RISK_FLAG_GATE_BEGIN\n'

if [[ ! -f "$ENV_FILE" ]]; then
  fail "environment file not found: $ENV_FILE"
else
  pass "environment file found"
fi
if [[ -n "$PM2_JSON" ]]; then
  pass "PM2 environment snapshot available for non-secret flag inspection"
else
  fail "PM2 environment snapshot unavailable; cannot prove existing process flags are fail-closed"
fi

# Phase 3 durable runtime must not be activated by the code-deploy operation.
assert_false_or_absent ENGAGEOS_EVENT_RUNTIME_ENABLED
assert_false_or_absent ENGAGEOS_EVENT_WORKER_ENABLED

# Phase 6 normalized cutover/backfill remains rollback-safe on legacy reads.
assert_exact_or_absent ENGAGEOS_WHATSAPP_CORE_MODE legacy
assert_false_or_absent ENGAGEOS_WHATSAPP_BACKFILL_COMPLETE

# Phase 7 Instagram external actions remain disabled.
assert_exact_or_absent INSTAGRAM_OUTBOUND_MODE disabled
assert_false_or_absent INSTAGRAM_COMMENT_AUTOMATION_ENABLED
assert_exact_or_absent INSTAGRAM_COMMENT_ACTION_MODE disabled
assert_on_or_absent INSTAGRAM_COMMENT_ACTION_KILL_SWITCH

# Phase 8 Facebook/Messenger external actions remain disabled.
assert_exact_or_absent MESSENGER_OUTBOUND_MODE disabled
assert_false_or_absent FACEBOOK_PAGE_COMMENT_AUTOMATION_ENABLED
assert_exact_or_absent FACEBOOK_PAGE_COMMENT_ACTION_MODE disabled
assert_on_or_absent FACEBOOK_PAGE_COMMENT_ACTION_KILL_SWITCH
assert_false_or_absent FACEBOOK_PAGE_COMMENT_WRITE_APPROVED
assert_false_or_absent ENGAGEOS_MESSENGER_POLICY_ENFORCED

# Existing WhatsApp outbound path remains explicitly disabled during code rollout.
assert_exact_or_absent WHATSAPP_OUTBOUND_MODE disabled
assert_false_or_absent WHATSAPP_CUTOVER_APPROVED
assert_empty_or_absent WHATSAPP_OUTBOUND_LIVE_ACK

# Agent and bulk/external writes remain disabled independently.
assert_false_or_absent AGENT_MODEL_CALLS_ENABLED
assert_false_or_absent AGENT_AUTO_REPLY_ENABLED
assert_false_or_absent AGENT_IMMEDIATE_DISPATCH_ENABLED
assert_false_or_absent WHATSAPP_CAMPAIGNS_ENABLED
assert_false_or_absent AUTOMATION_ACTIONS_ENABLED
assert_false_or_absent INTEGRATION_EXTERNAL_WRITES_ENABLED

# Phase 10 enforcement is a separate controlled activation after production evidence.
assert_false_or_absent ENGAGEOS_GROUNDED_AI_POLICY_ENFORCED

printf 'HIGH_RISK_FLAG_FAILURES=%s\n' "$failures"
if [[ "$failures" -eq 0 ]]; then
  printf 'HIGH_RISK_FLAG_GATE_STATUS=PASS\n'
  printf 'ENGAGEOS_HIGH_RISK_FLAG_GATE_END\n'
  exit 0
fi

printf 'HIGH_RISK_FLAG_GATE_STATUS=FAIL\n'
printf 'ENGAGEOS_HIGH_RISK_FLAG_GATE_END\n'
exit 1
