#!/usr/bin/env bash
set -Eeuo pipefail

APPLY="${APPLY:-0}"
LIVE_APP="${LIVE_APP:-$(pwd)}"
ENV_FILE="${ENV_FILE:-$LIVE_APP/.env}"
PM2_PROCESS_NAME="${PM2_PROCESS_NAME:-sikhadenge-whatsapp-agent}"
EXPECTED_RELEASE_SHA="${EXPECTED_RELEASE_SHA:-}"
RUN_ID="${RUN_ID:-email-cohort-$(date -u +%Y%m%dT%H%M%SZ)}"
BACKUP_ROOT="${BACKUP_ROOT:-/root/sikhadenge-backups}"
BACKUP_DIR="$BACKUP_ROOT/$RUN_ID"
COHORT="${EMAIL_AUTOMATION_COHORT_ALLOWLIST:-}"
WINDOW_SECONDS="${EMAIL_LIMITED_COHORT_WINDOW_SECONDS:-90}"
BASE_URL="${EMAIL_AUTOMATION_SCHEDULER_BASE_URL:-http://127.0.0.1:3100}"
stage="initializing"

fail(){ printf 'FAIL: %s\n' "$*" >&2; exit 1; }
read_env_value(){
  local key="$1"
  node - "$ENV_FILE" "$key" <<'NODE'
const fs = require('node:fs');
const [file, key] = process.argv.slice(2);
let value = '';
for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
  const index = normalized.indexOf('=');
  if (index < 1 || normalized.slice(0, index).trim() !== key) continue;
  value = normalized.slice(index + 1).trim();
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) value = value.slice(1, -1);
}
process.stdout.write(value);
NODE
}
sync_pm2_email_env_from_file(){
  local key value
  for key in EMAIL_RUNTIME_ENABLED EMAIL_AUTOMATION_ENABLED EMAIL_RUNTIME_MODE EMAIL_EXTERNAL_WRITES_ENABLED EMAIL_AUTOMATION_SCHEDULER_TOKEN EMAIL_AUTOMATION_COHORT_ALLOWLIST; do
    value="$(read_env_value "$key")"
    if [[ -n "$value" ]]; then
      export "$key=$value"
    else
      unset "$key"
    fi
  done
  # PM2 retains environment captured by earlier restarts. The canonical env file
  # must be pushed explicitly so the dynamic runtime and disk policy cannot drift.
  pm2 restart "$PM2_PROCESS_NAME" --update-env >/dev/null
}

[[ -n "$EXPECTED_RELEASE_SHA" ]] || fail "EXPECTED_RELEASE_SHA is required"
[[ -f "$ENV_FILE" ]] || fail "ENV_FILE not found"
[[ "$WINDOW_SECONDS" =~ ^[0-9]+$ ]] || fail "EMAIL_LIMITED_COHORT_WINDOW_SECONDS must be numeric"
(( WINDOW_SECONDS >= 30 && WINDOW_SECONDS <= 300 )) || fail "window must be 30-300 seconds"
command -v node >/dev/null 2>&1 || fail "node required"
command -v pm2 >/dev/null 2>&1 || fail "pm2 required"
cd "$LIVE_APP"
[[ "$(git rev-parse HEAD 2>/dev/null || true)" == "$EXPECTED_RELEASE_SHA" ]] || fail "git SHA mismatch"

NORMALIZED_COHORT="$(node - "$COHORT" <<'NODE'
const raw=process.argv[2]||'';
const list=[...new Set(raw.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean))];
if(list.length<1) throw new Error('cohort allowlist is empty');
if(list.length>10) throw new Error('first limited cohort may contain at most 10 recipients');
for(const email of list) if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`invalid cohort email: ${email}`);
process.stdout.write(list.join(','));
NODE
)" || fail "invalid cohort allowlist"

printf 'EMAIL_LIMITED_COHORT_PLAN\nAPPLY=%s\nMODE=LIMITED_COHORT\nCOHORT_COUNT=%s\nWINDOW_SECONDS=%s\nPOST_WINDOW_MODE=DRY_RUN\n' \
  "$APPLY" "$(awk -F, '{print NF}' <<<"$NORMALIZED_COHORT")" "$WINDOW_SECONDS"
[[ "$APPLY" == "1" ]] || { printf 'INFO: preview only\n'; exit 0; }
[[ "$(id -u)" == "0" ]] || fail "APPLY=1 requires root"

stage="backup-env"
install -d -m 700 "$BACKUP_DIR"
cp -a "$ENV_FILE" "$BACKUP_DIR/.env.before"
chmod 600 "$BACKUP_DIR/.env.before"
restored=0
restore(){
  code=$?
  failed_stage="$stage"
  trap - ERR EXIT INT TERM
  if [[ "$restored" != "1" ]]; then
    stage="restore-scheduler-deactivate"
    bash scripts/email-automation-scheduler-deactivate.sh >/dev/null 2>&1 || true
    stage="restore-env"
    cp -a "$BACKUP_DIR/.env.before" "$ENV_FILE" || true
    stage="restore-pm2-env"
    sync_pm2_email_env_from_file >/dev/null 2>&1 || true
    sleep 3
    stage="restore-scheduler-activate"
    APPLY=1 EMAIL_PREFLIGHT_EXPECTED_MODE=DRY_RUN EXPECTED_RELEASE_SHA="$EXPECTED_RELEASE_SHA" APP_DIR="$LIVE_APP" ENV_FILE="$ENV_FILE" \
      bash scripts/email-automation-scheduler-activate.sh >/dev/null 2>&1 || true
    restored=1
  fi
  if [[ "$code" == "0" ]]; then
    printf 'STATUS=PASS_LIMITED_COHORT_WINDOW_DRY_RUN_RESTORED\n' > "$BACKUP_DIR/limited-cohort-result.txt"
  else
    printf 'STATUS=FAILED_LIMITED_COHORT_WINDOW_DRY_RUN_RESTORED\nEXIT_CODE=%s\nFAILED_STAGE=%s\n' "$code" "$failed_stage" > "$BACKUP_DIR/limited-cohort-result.txt"
  fi
  chmod 600 "$BACKUP_DIR/limited-cohort-result.txt" 2>/dev/null || true
  exit "$code"
}
trap restore ERR EXIT INT TERM

stage="scheduler-deactivate"
bash scripts/email-automation-scheduler-deactivate.sh >/dev/null 2>&1 || true
stage="write-limited-cohort-env"
node - "$ENV_FILE" "$NORMALIZED_COHORT" <<'NODE'
const fs=require('node:fs'),path=require('node:path');
const file=process.argv[2], cohort=process.argv[3];
const original=fs.readFileSync(file,'utf8'), stat=fs.statSync(file);
const desired={EMAIL_RUNTIME_ENABLED:'true',EMAIL_AUTOMATION_ENABLED:'true',EMAIL_RUNTIME_MODE:'LIMITED_COHORT',EMAIL_EXTERNAL_WRITES_ENABLED:'true',EMAIL_AUTOMATION_COHORT_ALLOWLIST:cohort};
const keys=new Set(Object.keys(desired));
const kept=original.split(/\r?\n/).filter(raw=>{const line=raw.trim();if(!line||line.startsWith('#'))return true;const n=line.startsWith('export ')?line.slice(7).trim():line;const i=n.indexOf('=');return i<1||!keys.has(n.slice(0,i).trim());});
while(kept.length&&kept.at(-1)==='')kept.pop();
for(const [k,v] of Object.entries(desired)) kept.push(`${k}=${v}`);
kept.push('');
const tmp=path.join(path.dirname(file),`.${path.basename(file)}.${process.pid}.tmp`);
fs.writeFileSync(tmp,kept.join('\n'),{mode:stat.mode}); fs.chmodSync(tmp,stat.mode); try{fs.chownSync(tmp,stat.uid,stat.gid)}catch{} fs.renameSync(tmp,file);
NODE

stage="sync-pm2-limited-cohort-env"
sync_pm2_email_env_from_file
sleep 3
stage="activate-limited-cohort-scheduler"
APPLY=1 EMAIL_PREFLIGHT_EXPECTED_MODE=LIMITED_COHORT EXPECTED_RELEASE_SHA="$EXPECTED_RELEASE_SHA" APP_DIR="$LIVE_APP" ENV_FILE="$ENV_FILE" \
  bash scripts/email-automation-scheduler-activate.sh >"$BACKUP_DIR/limited-cohort-activate.log" 2>&1
chmod 600 "$BACKUP_DIR/limited-cohort-activate.log" 2>/dev/null || true
sleep 8

stage="verify-limited-cohort-env"
set -a
source "$ENV_FILE"
set +a
[[ "${EMAIL_RUNTIME_MODE:-}" == "LIMITED_COHORT" ]] || fail "runtime mode did not enter LIMITED_COHORT"
[[ "${EMAIL_EXTERNAL_WRITES_ENABLED:-}" == "true" ]] || fail "external writes not enabled in cohort window"
[[ "${EMAIL_AUTOMATION_ENABLED:-}" == "true" ]] || fail "automation not enabled in cohort window"
[[ "${EMAIL_AUTOMATION_COHORT_ALLOWLIST:-}" == "$NORMALIZED_COHORT" ]] || fail "cohort allowlist mismatch"
[[ ${#EMAIL_AUTOMATION_SCHEDULER_TOKEN} -ge 32 ]] || fail "scheduler token missing"

stage="verify-limited-cohort-health"
health="$BACKUP_DIR/limited-cohort-health.json"
code="$(curl -sS --max-time 10 -o "$health" -w '%{http_code}' -H "Authorization: Bearer $EMAIL_AUTOMATION_SCHEDULER_TOKEN" "${BASE_URL%/}/api/internal/email/automation/process" || true)"
[[ "$code" == "200" ]] || fail "protected scheduler health returned HTTP ${code:-unreachable}"
node - "$health" <<'NODE'
const fs=require('node:fs'); const h=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
if(h.runtimeEnabled!==true) throw new Error('runtime disabled');
if(h.automationEnabled!==true) throw new Error('automation disabled');
if(h.runtimeMode!=='LIMITED_COHORT') throw new Error('runtime mode mismatch');
if(h.externalWritesEnabled!==true) throw new Error('external writes disabled');
if(Number(h.staleProcessing||0)!==0) throw new Error('stale processing events present');
if(Number(h.failed||0)!==0) throw new Error('failed automation events present');
console.log(`LIMITED_COHORT_HEALTH=PASS pending=${Number(h.pending||0)} failed=${Number(h.failed||0)}`);
NODE

stage="limited-cohort-window-active"
printf 'LIMITED_COHORT_WINDOW_ACTIVE=true\n'
sleep "$WINDOW_SECONDS"
stage="window-complete"
restore