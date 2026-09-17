#!/usr/bin/env bash
set -Eeuo pipefail

EXPECTED_RELEASE_SHA="${EXPECTED_RELEASE_SHA:-}"
LIVE_APP="${LIVE_APP:-/var/www/sikhadenge-whatsapp-agent/source/apps/whatsapp-agent-dashboard}"
DEPLOY_STATE_FILE="${DEPLOY_STATE_FILE:-}"
PM2_PROCESS_NAME="${PM2_PROCESS_NAME:-sikhadenge-whatsapp-agent}"
CHECK_HTTP_URL="${CHECK_HTTP_URL:-https://whatsapp.sikhadenge.in}"

failures=0
pass() { printf 'PASS: %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; failures=$((failures + 1)); }

printf 'PHASE17_RUNTIME_IDENTITY_BEGIN\n'
printf 'UTC_TIMESTAMP=%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

if [[ ! "$EXPECTED_RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  fail "EXPECTED_RELEASE_SHA must be an exact 40-character lowercase commit SHA"
fi

if [[ ! -d "$LIVE_APP" ]]; then
  fail "canonical live app directory is missing"
fi

source_sha="$(git -C "$LIVE_APP" rev-parse HEAD 2>/dev/null || true)"
source_top="$(git -C "$LIVE_APP" rev-parse --show-toplevel 2>/dev/null || true)"
source_dirty="$(git -C "$LIVE_APP" status --porcelain --untracked-files=no 2>/dev/null || true)"
source_build="$(cat "$LIVE_APP/.next/BUILD_ID" 2>/dev/null || true)"

printf 'SOURCE_SHA=%s\n' "${source_sha:-missing}"
printf 'SOURCE_BUILD_ID=%s\n' "${source_build:-missing}"
printf 'SOURCE_TRACKED_DIRTY_COUNT=%s\n' "$(printf '%s\n' "$source_dirty" | sed '/^$/d' | wc -l | tr -d ' ')"

if [[ -n "$EXPECTED_RELEASE_SHA" && "$source_sha" == "$EXPECTED_RELEASE_SHA" ]]; then
  pass "canonical source SHA matches expected release SHA"
else
  fail "canonical source SHA does not match expected release SHA"
fi

if [[ -n "$source_top" && -z "$source_dirty" ]]; then
  pass "canonical source tracked worktree is clean"
else
  fail "canonical source tracked worktree is not clean"
fi

if [[ -n "$source_build" ]]; then
  pass "canonical source build ID is present"
else
  fail "canonical source build ID is missing"
fi

pm2_json="$(mktemp)"
trap 'rm -f "$pm2_json"' EXIT
if pm2 jlist > "$pm2_json" 2>/dev/null; then
  IFS='|' read -r pm2_status runtime_app < <(
    node - "$PM2_PROCESS_NAME" "$pm2_json" <<'NODE'
const fs = require('node:fs');
const [name, file] = process.argv.slice(2);
const entry = JSON.parse(fs.readFileSync(file, 'utf8')).find((item) => item.name === name);
if (!entry) process.exit(1);
process.stdout.write(`${String(entry.pm2_env?.status || '')}|${String(entry.pm2_env?.pm_cwd || '')}\n`);
NODE
  )
else
  pm2_status=""
  runtime_app=""
fi

printf 'PM2_STATUS=%s\n' "${pm2_status:-missing}"
printf 'RUNTIME_APP=%s\n' "${runtime_app:-missing}"

if [[ "$pm2_status" == "online" ]]; then
  pass "PM2 process is online"
else
  fail "PM2 process is not online"
fi

case "$runtime_app" in
  /var/www/sikhadenge-whatsapp-agent/*) pass "PM2 runtime path is inside the approved production root" ;;
  *) fail "PM2 runtime path is outside the approved production root" ;;
esac

runtime_sha=""
runtime_top=""
runtime_dirty=""
runtime_build=""
if [[ -n "$runtime_app" && -d "$runtime_app" ]]; then
  runtime_sha="$(git -C "$runtime_app" rev-parse HEAD 2>/dev/null || true)"
  runtime_top="$(git -C "$runtime_app" rev-parse --show-toplevel 2>/dev/null || true)"
  runtime_dirty="$(git -C "$runtime_app" status --porcelain --untracked-files=no 2>/dev/null || true)"
  runtime_build="$(cat "$runtime_app/.next/BUILD_ID" 2>/dev/null || true)"
fi

printf 'RUNTIME_GIT_SHA=%s\n' "${runtime_sha:-missing}"
printf 'RUNTIME_BUILD_ID=%s\n' "${runtime_build:-missing}"
printf 'RUNTIME_TRACKED_DIRTY_COUNT=%s\n' "$(printf '%s\n' "$runtime_dirty" | sed '/^$/d' | wc -l | tr -d ' ')"

if [[ -n "$runtime_top" && -z "$runtime_dirty" ]]; then
  pass "PM2 runtime tracked worktree is clean"
else
  fail "PM2 runtime tracked worktree is not clean or is not a Git checkout"
fi

if [[ -n "$runtime_build" && "$runtime_build" == "$source_build" ]]; then
  pass "PM2 runtime build ID matches canonical source build ID"
else
  fail "PM2 runtime build ID does not match canonical source build ID"
fi

source_app_real="$(realpath -m "$LIVE_APP")"
runtime_app_real="$(realpath -m "${runtime_app:-/nonexistent}")"

if [[ -z "$DEPLOY_STATE_FILE" || ! -f "$DEPLOY_STATE_FILE" ]]; then
  fail "verified deploy-state file is required for runtime identity"
  deploy_state_real=""
  deploy_release_sha=""
  deploy_new_build_id=""
  deploy_runtime_app=""
else
  deploy_state_real="$(realpath -e "$DEPLOY_STATE_FILE" 2>/dev/null || true)"
  case "$deploy_state_real" in
    /root/sikhadenge-backups/engageos-*/deploy-state.txt) pass "deploy-state file is inside the approved production backup root" ;;
    *) fail "deploy-state file is outside the approved production backup root" ;;
  esac

  deploy_release_sha="$(awk -F= '$1 == "RELEASE_SHA" {print substr($0, index($0,"=")+1); exit}' "$DEPLOY_STATE_FILE")"
  deploy_new_build_id="$(awk -F= '$1 == "NEW_BUILD_ID" {print substr($0, index($0,"=")+1); exit}' "$DEPLOY_STATE_FILE")"
  deploy_runtime_app="$(awk -F= '$1 == "RUNTIME_APP" {print substr($0, index($0,"=")+1); exit}' "$DEPLOY_STATE_FILE")"
fi

printf 'DEPLOY_STATE_FILE=%s\n' "${deploy_state_real:-missing}"
printf 'DEPLOY_RELEASE_SHA=%s\n' "${deploy_release_sha:-missing}"
printf 'DEPLOY_NEW_BUILD_ID=%s\n' "${deploy_new_build_id:-missing}"
printf 'DEPLOY_RUNTIME_APP=%s\n' "${deploy_runtime_app:-missing}"

if [[ "$deploy_release_sha" == "$EXPECTED_RELEASE_SHA" ]]; then
  pass "deploy-state release SHA matches expected release SHA"
else
  fail "deploy-state release SHA does not match expected release SHA"
fi

if [[ -n "$deploy_new_build_id" && "$deploy_new_build_id" == "$source_build" && "$deploy_new_build_id" == "$runtime_build" ]]; then
  pass "deploy-state build ID matches canonical source and PM2 runtime build IDs"
else
  fail "deploy-state build ID does not match canonical source and PM2 runtime build IDs"
fi

if [[ "$(realpath -m "${deploy_runtime_app:-/nonexistent}")" == "$runtime_app_real" ]]; then
  pass "deploy-state runtime path matches PM2 runtime path"
else
  fail "deploy-state runtime path does not match PM2 runtime path"
fi

if [[ "$runtime_app_real" == "$source_app_real" ]]; then
  printf 'RUNTIME_IDENTITY_MODE=canonical-source\n'
  if [[ "$runtime_sha" == "$EXPECTED_RELEASE_SHA" ]]; then
    pass "canonical-source runtime Git SHA matches expected release SHA"
  else
    fail "canonical-source runtime Git SHA does not match expected release SHA"
  fi
else
  printf 'RUNTIME_IDENTITY_MODE=separate-build-mirror\n'
  pass "separate build mirror identity is bound by build ID plus deploy-state provenance"
fi

login_status="$(curl -L -sS -o /dev/null -w '%{http_code}' --max-time 20 "${CHECK_HTTP_URL%/}/login" || true)"
printf 'LOGIN_HTTP_STATUS=%s\n' "$login_status"
if [[ "$login_status" == "200" ]]; then
  pass "login route returned HTTP 200"
else
  fail "login route did not return HTTP 200"
fi

printf 'RUNTIME_IDENTITY_FAILURES=%s\n' "$failures"
if [[ "$failures" -eq 0 ]]; then
  printf 'PHASE17_RUNTIME_IDENTITY=PASS\n'
  printf 'PHASE17_RUNTIME_IDENTITY_END\n'
  exit 0
fi

printf 'PHASE17_RUNTIME_IDENTITY=FAIL\n'
printf 'PHASE17_RUNTIME_IDENTITY_END\n'
exit 1
