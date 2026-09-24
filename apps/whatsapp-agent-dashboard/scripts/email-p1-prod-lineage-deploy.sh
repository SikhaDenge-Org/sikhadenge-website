#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${ROOT:-/var/www/sikhadenge-whatsapp-agent/source}"
APP="$ROOT/apps/whatsapp-agent-dashboard"
PROCESS="${PM2_PROCESS_NAME:-sikhadenge-whatsapp-agent}"
SERVICE_NAME="${SERVICE_NAME:-sikhadenge-email-automation-scheduler}"
EXPECTED_OLD_SHA="${EXPECTED_OLD_SHA:?EXPECTED_OLD_SHA required}"
TARGET_REF="${TARGET_REF:?TARGET_REF required}"
TARGET_SHA="${TARGET_SHA:?TARGET_SHA required}"
RUN_ID="${RUN_ID:-email-p1-prod-align-$(date -u +%Y%m%dT%H%M%SZ)}"
BACKUP_ROOT="${BACKUP_ROOT:-/root/sikhadenge-backups}"
BACKUP="$BACKUP_ROOT/$RUN_ID"
WORKTREE="/tmp/$RUN_ID"
STAGE_APP="$WORKTREE/apps/whatsapp-agent-dashboard"
ENV_FILE="$APP/.env"
RUNTIME_APP=""
SCHEDULER_STOPPED=false
ADVANCED=false
SWAPPED_APP=false
SWAPPED_RUNTIME=false

fail(){ printf 'FAIL: %s\n' "$*" >&2; exit 1; }
cleanup(){ git -C "$ROOT" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true; rm -rf "$WORKTREE" >/dev/null 2>&1 || true; }
rollback(){
  rc=$?
  trap - ERR INT TERM
  set +e
  printf 'EMAIL_P1_PROD_ALIGN_ROLLBACK=BEGIN exit_code=%s\n' "$rc" >&2
  if [[ "$SCHEDULER_STOPPED" == true ]]; then APPLY=1 SERVICE_NAME="$SERVICE_NAME" bash "$APP/scripts/email-automation-scheduler-deactivate.sh" >/dev/null 2>&1 || true; fi
  if [[ "$SWAPPED_RUNTIME" == true && -n "$RUNTIME_APP" && -d "$BACKUP/.next.runtime.before" ]]; then rm -rf "$RUNTIME_APP/.next"; mv "$BACKUP/.next.runtime.before" "$RUNTIME_APP/.next"; fi
  if [[ "$SWAPPED_APP" == true && -d "$BACKUP/.next.app.before" ]]; then rm -rf "$APP/.next"; mv "$BACKUP/.next.app.before" "$APP/.next"; fi
  if [[ "$ADVANCED" == true ]]; then git -C "$ROOT" reset --hard "$EXPECTED_OLD_SHA" >/dev/null 2>&1 || true; fi
  if [[ "$SWAPPED_APP" == true || "$SWAPPED_RUNTIME" == true || "$ADVANCED" == true ]]; then pm2 restart "$PROCESS" >/dev/null 2>&1 || true; fi
  if [[ "$SCHEDULER_STOPPED" == true ]]; then
    APPLY=1 EXPECTED_RELEASE_SHA="$EXPECTED_OLD_SHA" APP_DIR="$APP" ENV_FILE="$ENV_FILE" SERVICE_NAME="$SERVICE_NAME" bash "$APP/scripts/email-automation-scheduler-activate.sh" >/dev/null 2>&1 || true
  fi
  cleanup
  printf 'STATUS=ROLLED_BACK\nEXIT_CODE=%s\nEXPECTED_OLD_SHA=%s\nTARGET_SHA=%s\n' "$rc" "$EXPECTED_OLD_SHA" "$TARGET_SHA" > "$BACKUP/align-result.txt" 2>/dev/null || true
  chmod 600 "$BACKUP/align-result.txt" 2>/dev/null || true
  printf 'EMAIL_P1_PROD_ALIGN_ROLLBACK=COMPLETE\n' >&2
  exit "$rc"
}
trap rollback ERR INT TERM

[[ "$(id -u)" == "0" ]] || fail "production alignment requires root"
[[ "$EXPECTED_OLD_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "EXPECTED_OLD_SHA must be a full SHA"
[[ "$TARGET_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "TARGET_SHA must be a full SHA"
[[ -d "$ROOT/.git" || -f "$ROOT/.git" ]] || fail "ROOT is not a git checkout"
[[ -f "$APP/package.json" && -f "$ENV_FILE" ]] || fail "Email app or env is missing"
for cmd in git node npm pm2 systemctl curl; do command -v "$cmd" >/dev/null || fail "$cmd is missing"; done

install -d -m 700 "$BACKUP"
cd "$ROOT"
CURRENT_SHA="$(git rev-parse HEAD)"
printf 'EMAIL_P1_PROD_ALIGN_BEGIN\nCURRENT_SHA=%s\nTARGET_SHA=%s\n' "$CURRENT_SHA" "$TARGET_SHA"
[[ "$CURRENT_SHA" == "$EXPECTED_OLD_SHA" ]] || fail "live source moved from expected old SHA"
actual_dirty="$(git status --porcelain --untracked-files=no | sed '/^$/d')"
[[ -z "$actual_dirty" ]] || { printf 'TRACKED_DIRTY_UNEXPECTED_BEGIN\n%s\nTRACKED_DIRTY_UNEXPECTED_END\n' "$actual_dirty" >&2; fail "production source has tracked drift"; }
printf 'TRACKED_DIRTY_PRE=CLEAN\n'

git fetch --no-tags origin "$TARGET_REF"
[[ "$(git rev-parse FETCH_HEAD)" == "$TARGET_SHA" ]] || fail "TARGET_REF does not resolve to pinned TARGET_SHA"
[[ "$(git rev-parse "${TARGET_SHA}^")" == "$EXPECTED_OLD_SHA" ]] || fail "target is not a single direct child of the live SHA"

expected_diff="$(cat <<'LIST' | sort
apps/whatsapp-agent-dashboard/.env.example
apps/whatsapp-agent-dashboard/app/api/email/deliverability/route.ts
apps/whatsapp-agent-dashboard/modules/email-automation/application/automation-send-policy.ts
apps/whatsapp-agent-dashboard/modules/email-automation/application/deliverability-evidence-service.ts
apps/whatsapp-agent-dashboard/modules/email-automation/application/deliverability-guardrails.ts
apps/whatsapp-agent-dashboard/modules/email-automation/application/manual-send-service.ts
apps/whatsapp-agent-dashboard/modules/email-automation/automation/scheduler.ts
apps/whatsapp-agent-dashboard/modules/email-automation/docs/P1_AUTOMATED_DELIVERABILITY_EVIDENCE.md
apps/whatsapp-agent-dashboard/modules/email-automation/docs/phase-d-deliverability-guardrails.md
apps/whatsapp-agent-dashboard/modules/email-automation/tests/automation-dispatcher.test.ts
apps/whatsapp-agent-dashboard/modules/email-automation/tests/deliverability-evidence.test.ts
apps/whatsapp-agent-dashboard/modules/email-automation/tests/deliverability-guardrails.test.ts
apps/whatsapp-agent-dashboard/scripts/email-automation-deliverability-preflight.ts
apps/whatsapp-agent-dashboard/scripts/email-automation-production-preflight.sh
apps/whatsapp-agent-dashboard/scripts/email-deliverability-refresh.ts
apps/whatsapp-agent-dashboard/tests/email-automation-deliverability-preflight-policy.test.sh
apps/whatsapp-agent-dashboard/tests/email-automation-production-preflight-policy.test.sh
LIST
)"
actual_diff="$(git diff --name-only "$EXPECTED_OLD_SHA" "$TARGET_SHA" | sort)"
printf 'TARGET_DIFF_BEGIN\n%s\nTARGET_DIFF_END\n' "$actual_diff"
[[ "$actual_diff" == "$expected_diff" ]] || fail "target diff escaped Email P1 allowlist"

[[ "$(git show "$TARGET_SHA:apps/whatsapp-agent-dashboard/modules/email-automation/application/deliverability-evidence-service.ts" | git hash-object --stdin)" == "ac89d8c15d0bdf0bd377c7ff0ae1dd64f1b9aa54" ]] || fail "deliverability evidence service blob mismatch"
[[ "$(git show "$TARGET_SHA:apps/whatsapp-agent-dashboard/modules/email-automation/application/deliverability-guardrails.ts" | git hash-object --stdin)" == "2bc9903bada58bb28ccce3daa174e21ea72b813a" ]] || fail "deliverability guardrail blob mismatch"
[[ "$(git show "$TARGET_SHA:apps/whatsapp-agent-dashboard/scripts/email-automation-deliverability-preflight.ts" | git hash-object --stdin)" == "80bff9cedb8e607c1a5ff7d71f378704fd8b2504" ]] || fail "deliverability preflight blob mismatch"
[[ "$(git show "$TARGET_SHA:apps/whatsapp-agent-dashboard/scripts/email-deliverability-refresh.ts" | git hash-object --stdin)" == "f5a0ac5b5efd870b7010e7dff82d7a5cceb99a0f" ]] || fail "deliverability refresh blob mismatch"
[[ "$(git show "$TARGET_SHA:apps/whatsapp-agent-dashboard/modules/email-automation/automation/scheduler.ts" | git hash-object --stdin)" == "a358a0148f81a3ee230c5b39157f011fbe1afbd3" ]] || fail "scheduler blob mismatch"
[[ "$(git show "$TARGET_SHA:apps/whatsapp-agent-dashboard/app/api/email/deliverability/route.ts" | git hash-object --stdin)" == "50934761ffd621a0c6cb3f45ae6b4a9b465e0d9f" ]] || fail "deliverability API blob mismatch"

set -a
source "$ENV_FILE"
set +a
[[ "${EMAIL_RUNTIME_ENABLED:-false}" == "true" ]] || fail "email runtime is not enabled"
[[ "${EMAIL_RUNTIME_MODE:-}" == "DRY_RUN" ]] || fail "email runtime is not DRY_RUN"
[[ "${EMAIL_EXTERNAL_WRITES_ENABLED:-true}" == "false" ]] || fail "external email writes are not disabled"
printf 'RUNTIME_PRECHECK=DRY_RUN_EXTERNAL_WRITES_OFF\n'

pm2_json="$(pm2 jlist)"
IFS='|' read -r PRE_PM2_PID PRE_PM2_STATUS PRE_PM2_CWD < <(printf '%s' "$pm2_json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s||"[]").find(x=>x.name==="sikhadenge-whatsapp-agent");process.stdout.write((p?[p.pid||"",p.pm2_env?.status||"",p.pm2_env?.pm_cwd||""].join("|"):"||")+"\n")})')
[[ -n "$PRE_PM2_PID" && "$PRE_PM2_STATUS" == "online" ]] || fail "PM2 production process is not online"
RUNTIME_APP="${PRE_PM2_CWD:-$APP}"
case "$RUNTIME_APP" in /var/www/sikhadenge-whatsapp-agent/*) ;; *) fail "unexpected PM2 runtime cwd: $RUNTIME_APP" ;; esac
[[ -d "$APP/.next" && -d "$RUNTIME_APP/.next" ]] || fail "current production build is missing"
PRE_APP_BUILD_ID="$(cat "$APP/.next/BUILD_ID")"
PRE_RUNTIME_BUILD_ID="$(cat "$RUNTIME_APP/.next/BUILD_ID")"
[[ "$PRE_APP_BUILD_ID" == "$PRE_RUNTIME_BUILD_ID" ]] || fail "source/runtime build IDs differ before deploy"

cleanup
git worktree add --detach "$WORKTREE" "$TARGET_SHA" >/dev/null
ln -s "$APP/node_modules" "$STAGE_APP/node_modules"
ln -s "$ENV_FILE" "$STAGE_APP/.env"
cd "$STAGE_APP"
{
  npx tsx modules/email-automation/tests/deliverability-evidence.test.ts
  npx tsx modules/email-automation/tests/deliverability-guardrails.test.ts
  npx tsx modules/email-automation/tests/automation-dispatcher.test.ts
  bash tests/email-automation-deliverability-preflight-policy.test.sh
  bash tests/email-automation-production-preflight-policy.test.sh
  npm run typecheck
} > "$BACKUP/tests.log" 2>&1
NEXT_TELEMETRY_DISABLED=1 npm run build > "$BACKUP/build.log" 2>&1
STAGED_BUILD_ID="$(cat "$STAGE_APP/.next/BUILD_ID")"
[[ -n "$STAGED_BUILD_ID" ]] || fail "staged build ID is empty"
printf 'STAGED_BUILD_ID=%s\n' "$STAGED_BUILD_ID"

cd "$APP"
APPLY=1 SERVICE_NAME="$SERVICE_NAME" bash scripts/email-automation-scheduler-deactivate.sh > "$BACKUP/deactivate.log" 2>&1
SCHEDULER_STOPPED=true
cd "$ROOT"
[[ -z "$(git status --porcelain --untracked-files=no | sed '/^$/d')" ]] || fail "tracked source became dirty before fast-forward"
git merge --ff-only "$TARGET_SHA" > "$BACKUP/git-fast-forward.log" 2>&1
ADVANCED=true
[[ "$(git rev-parse HEAD)" == "$TARGET_SHA" ]] || fail "production source did not advance to target SHA"
[[ -z "$(git status --porcelain --untracked-files=no | sed '/^$/d')" ]] || fail "tracked source is dirty after fast-forward"

mv "$APP/.next" "$BACKUP/.next.app.before"
cp -a "$STAGE_APP/.next" "$APP/.next"
SWAPPED_APP=true
if [[ "$RUNTIME_APP" != "$APP" ]]; then mv "$RUNTIME_APP/.next" "$BACKUP/.next.runtime.before"; cp -a "$STAGE_APP/.next" "$RUNTIME_APP/.next"; SWAPPED_RUNTIME=true; fi
[[ "$(cat "$APP/.next/BUILD_ID")" == "$STAGED_BUILD_ID" ]] || fail "canonical app build swap failed"
[[ "$(cat "$RUNTIME_APP/.next/BUILD_ID")" == "$STAGED_BUILD_ID" ]] || fail "PM2 runtime build swap failed"
pm2 restart "$PROCESS" > "$BACKUP/pm2-restart.log" 2>&1
sleep 5

cd "$APP"
EMAIL_PREFLIGHT_EXPECTED_MODE=DRY_RUN EXPECTED_RELEASE_SHA="$TARGET_SHA" ENV_FILE="$ENV_FILE" bash scripts/email-automation-production-preflight.sh | tee "$BACKUP/preflight.log"
APPLY=1 EXPECTED_RELEASE_SHA="$TARGET_SHA" APP_DIR="$APP" ENV_FILE="$ENV_FILE" SERVICE_NAME="$SERVICE_NAME" bash scripts/email-automation-scheduler-activate.sh | tee "$BACKUP/activate.log"
systemctl start "${SERVICE_NAME}.service"
EXPECTED_RELEASE_SHA="$TARGET_SHA" ENV_FILE="$ENV_FILE" SERVICE_NAME="$SERVICE_NAME" MAX_FAILED_EVENTS=0 bash scripts/email-automation-scheduler-verify.sh | tee "$BACKUP/verify.log"

set -a
source "$ENV_FILE"
set +a
npx tsx scripts/email-deliverability-refresh.ts | tee "$BACKUP/deliverability-refresh.log"
grep -Fxq 'EMAIL_DELIVERABILITY_REFRESH=PASS' "$BACKUP/deliverability-refresh.log"
connections_scanned="$(sed -n 's/^EMAIL_DELIVERABILITY_CONNECTIONS_SCANNED=//p' "$BACKUP/deliverability-refresh.log" | tail -1)"
domains="$(sed -n 's/^EMAIL_DELIVERABILITY_DOMAINS=//p' "$BACKUP/deliverability-refresh.log" | tail -1)"
refreshed="$(sed -n 's/^EMAIL_DELIVERABILITY_REFRESHED=//p' "$BACKUP/deliverability-refresh.log" | tail -1)"
[[ "$connections_scanned" =~ ^[0-9]+$ && "$connections_scanned" -gt 0 ]] || fail "no connected Email connection was scanned"
[[ "$domains" =~ ^[0-9]+$ && "$domains" -gt 0 ]] || fail "no verified sender domain produced deliverability evidence"
grep -Fq '"complaintTelemetrySource": "UNAVAILABLE"' "$BACKUP/deliverability-refresh.log" || fail "expected fail-closed complaint telemetry source was not observed"
printf 'DELIVERABILITY_EVIDENCE_REFRESH=PASS connections=%s domains=%s refreshed=%s\n' "$connections_scanned" "$domains" "$refreshed"

[[ "${EMAIL_RUNTIME_ENABLED:-false}" == "true" ]]
[[ "${EMAIL_RUNTIME_MODE:-}" == "DRY_RUN" ]]
[[ "${EMAIL_EXTERNAL_WRITES_ENABLED:-true}" == "false" ]]
[[ "$(git -C "$ROOT" rev-parse HEAD)" == "$TARGET_SHA" ]]
[[ -z "$(git -C "$ROOT" status --porcelain --untracked-files=no | sed '/^$/d')" ]]

post_pm2_json="$(pm2 jlist)"
IFS='|' read -r POST_PM2_PID POST_PM2_STATUS POST_PM2_CWD < <(printf '%s' "$post_pm2_json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s||"[]").find(x=>x.name==="sikhadenge-whatsapp-agent");process.stdout.write((p?[p.pid||"",p.pm2_env?.status||"",p.pm2_env?.pm_cwd||""].join("|"):"||")+"\n")})')
[[ -n "$POST_PM2_PID" && "$POST_PM2_STATUS" == "online" ]] || fail "PM2 process is not online after deploy"
[[ "$POST_PM2_CWD" == "$RUNTIME_APP" ]] || fail "PM2 cwd changed unexpectedly"
[[ "$(cat "$POST_PM2_CWD/.next/BUILD_ID")" == "$STAGED_BUILD_ID" ]] || fail "PM2 runtime is not serving staged build"
login_local="$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/login || true)"
case "$login_local" in 200|301|302|303|307|308) ;; *) fail "local login health failed: HTTP $login_local" ;; esac
login_public="$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' https://whatsapp.sikhadenge.in/login || true)"
[[ "$login_public" == "200" ]] || fail "public login health failed: HTTP $login_public"

[[ "$(git hash-object "$APP/modules/email-automation/application/deliverability-evidence-service.ts")" == "ac89d8c15d0bdf0bd377c7ff0ae1dd64f1b9aa54" ]]
[[ "$(git hash-object "$APP/modules/email-automation/application/deliverability-guardrails.ts")" == "2bc9903bada58bb28ccce3daa174e21ea72b813a" ]]
[[ "$(git hash-object "$APP/scripts/email-deliverability-refresh.ts")" == "f5a0ac5b5efd870b7010e7dff82d7a5cceb99a0f" ]]

printf 'STATUS=PASS\nOLD_SHA=%s\nTARGET_SHA=%s\nPRE_BUILD_ID=%s\nPOST_BUILD_ID=%s\nPM2_STATUS=online\nPM2_PID=%s\nPM2_CWD=%s\nRUNTIME_MODE=DRY_RUN\nEXTERNAL_WRITES=false\nSCHEDULER_ACTIVE=true\nTRACKED_DIRTY_AFTER=0\nLOGIN_LOCAL_HTTP=%s\nLOGIN_PUBLIC_HTTP=%s\nDELIVERABILITY_CONNECTIONS_SCANNED=%s\nDELIVERABILITY_DOMAINS=%s\nDELIVERABILITY_REFRESHED=%s\nCOMPLAINT_SOURCE_UNAVAILABLE=true\nSCALED_DELIVERY_ENABLED=false\nCOMPLETED_UTC=%s\n' \
  "$EXPECTED_OLD_SHA" "$TARGET_SHA" "$PRE_APP_BUILD_ID" "$STAGED_BUILD_ID" "$POST_PM2_PID" "$POST_PM2_CWD" "$login_local" "$login_public" "$connections_scanned" "$domains" "$refreshed" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$BACKUP/align-result.txt"
chmod 600 "$BACKUP"/*.log "$BACKUP/align-result.txt" 2>/dev/null || true

trap - ERR INT TERM
SCHEDULER_STOPPED=false
ADVANCED=false
SWAPPED_APP=false
SWAPPED_RUNTIME=false
rm -rf "$BACKUP/.next.app.before" "$BACKUP/.next.runtime.before"
cleanup
printf 'EMAIL_P1_PROD_ALIGN=PASS\nTARGET_SHA=%s\nBUILD_ID=%s\nRUNTIME_MODE=DRY_RUN\nEXTERNAL_WRITES=false\nSCHEDULER_ACTIVE=true\nDELIVERABILITY_DOMAINS=%s\nCOMPLAINT_SOURCE_UNAVAILABLE=true\nSCALED_DELIVERY_ENABLED=false\nTRACKED_DIRTY_AFTER=0\n' "$TARGET_SHA" "$STAGED_BUILD_ID" "$domains"
