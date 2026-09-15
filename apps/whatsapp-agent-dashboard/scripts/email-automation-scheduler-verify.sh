#!/usr/bin/env bash
set -Eeuo pipefail
ENV_FILE="${ENV_FILE:-.env}"
EXPECTED_RELEASE_SHA="${EXPECTED_RELEASE_SHA:-}"
SERVICE_NAME="${SERVICE_NAME:-sikhadenge-email-automation-scheduler}"
SCHEDULER_BASE_URL="${EMAIL_AUTOMATION_SCHEDULER_BASE_URL:-http://127.0.0.1:3100}"
MAX_RUN_AGE_SECONDS="${MAX_RUN_AGE_SECONDS:-900}"
MAX_FAILED_EVENTS="${MAX_FAILED_EVENTS:-0}"
failures=0
pass(){ printf 'PASS: %s\n' "$*"; }
fail(){ printf 'FAIL: %s\n' "$*"; failures=$((failures+1)); }
read_env_value(){ local key="$1" file="$2"; node - "$file" "$key" <<'NODE'
const fs=require('node:fs'); const [file,key]=process.argv.slice(2); if(!file||!key||!fs.existsSync(file)) process.exit(0);
let value=''; for(const raw of fs.readFileSync(file,'utf8').split(/\r?\n/)){ const line=raw.trim(); if(!line||line.startsWith('#')) continue; const n=line.startsWith('export ')?line.slice(7).trim():line; const i=n.indexOf('='); if(i<1||n.slice(0,i).trim()!==key) continue; value=n.slice(i+1).trim(); if(value.length>=2&&((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))) value=value.slice(1,-1); } process.stdout.write(value);
NODE
}
value_for(){ local key="$1" persisted=""; if [[ -f "$ENV_FILE" ]]; then persisted="$(read_env_value "$key" "$ENV_FILE")"; fi; printf '%s' "${!key:-$persisted}"; }
printf 'EMAIL_AUTOMATION_SCHEDULER_VERIFY_BEGIN\n'
[[ -n "$EXPECTED_RELEASE_SHA" ]] || fail "EXPECTED_RELEASE_SHA is required"
current_sha="$(git rev-parse HEAD 2>/dev/null || true)"
[[ -n "$EXPECTED_RELEASE_SHA" && "$current_sha" == "$EXPECTED_RELEASE_SHA" ]] && pass "release SHA matches" || fail "release SHA mismatch"
command -v systemctl >/dev/null 2>&1 || fail "systemctl is required"
if systemctl is-enabled "${SERVICE_NAME}.timer" >/dev/null 2>&1; then pass "scheduler timer enabled"; else fail "scheduler timer not enabled"; fi
if systemctl is-active "${SERVICE_NAME}.timer" >/dev/null 2>&1; then pass "scheduler timer active"; else fail "scheduler timer not active"; fi
if systemctl show "${SERVICE_NAME}.timer" -p LastTriggerUSec --value >/tmp/email-scheduler-last-trigger 2>/dev/null; then
  last_trigger="$(cat /tmp/email-scheduler-last-trigger)"; rm -f /tmp/email-scheduler-last-trigger; printf 'LAST_TRIGGER=%s\n' "$last_trigger";
else fail "timer metadata unavailable"; fi
scheduler_token="$(value_for EMAIL_AUTOMATION_SCHEDULER_TOKEN)"
if (( ${#scheduler_token} >= 32 )); then pass "scheduler token present"; else fail "scheduler token missing or too short"; fi
health_file="$(mktemp)"; trap 'rm -f "$health_file"' EXIT
if (( ${#scheduler_token} >= 32 )); then
  http_code="$(curl -sS --max-time 10 -o "$health_file" -w '%{http_code}' -H "Authorization: Bearer $scheduler_token" "${SCHEDULER_BASE_URL%/}/api/internal/email/automation/process" || true)"
  [[ "$http_code" == "200" ]] || fail "scheduler health returned HTTP ${http_code:-unreachable}"
  if [[ "$http_code" == "200" ]]; then
    if node - "$health_file" "$MAX_RUN_AGE_SECONDS" "$MAX_FAILED_EVENTS" <<'NODE'
const fs=require('node:fs'); const [file,maxAgeRaw,maxFailedRaw]=process.argv.slice(2); const h=JSON.parse(fs.readFileSync(file,'utf8'));
const maxAge=Number(maxAgeRaw), maxFailed=Number(maxFailedRaw);
if(h.runtimeEnabled!==true) throw new Error('runtime disabled');
if(h.automationEnabled!==true) throw new Error('automation disabled');
if(h.runtimeMode!=='DRY_RUN') throw new Error('runtime mode not DRY_RUN');
if(h.externalWritesEnabled!==false) throw new Error('external writes enabled');
if(Number(h.staleProcessing||0)!==0) throw new Error('stale processing events present');
if(Number(h.failed||0)>maxFailed) throw new Error('failed queue exceeds threshold');
if(!h.latestSchedulerRun?.createdAt||!h.latestSchedulerRun?.runId) throw new Error('latest scheduler audit missing');
const age=(Date.now()-new Date(h.latestSchedulerRun.createdAt).getTime())/1000;
if(!Number.isFinite(age)||age<0||age>maxAge) throw new Error('latest scheduler audit too old');
const summary=h.latestSchedulerRun.summary||{};
if(Number(summary.failed||0)!==0) throw new Error('latest scheduler run reported failures');
process.stdout.write(JSON.stringify({runId:h.latestSchedulerRun.runId,runAgeSeconds:Math.round(age),pending:h.pending,failed:h.failed,processed:summary.processed||0,recovered:summary.recovered||0}));
NODE
    then printf '\nPASS: protected health and first-run audit are safe\n'; else fail "health/audit safety contract failed"; fi
  fi
fi
printf 'FAILURES=%s\n' "$failures"
if (( failures>0 )); then printf 'EMAIL_AUTOMATION_SCHEDULER_VERIFY=FAIL\n'; exit 1; fi
printf 'EMAIL_AUTOMATION_SCHEDULER_VERIFY=PASS\n'