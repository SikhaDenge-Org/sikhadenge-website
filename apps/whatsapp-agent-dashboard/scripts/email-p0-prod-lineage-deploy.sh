#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${ROOT:-/var/www/sikhadenge-whatsapp-agent/source}"
APP="$ROOT/apps/whatsapp-agent-dashboard"
PROCESS="${PM2_PROCESS_NAME:-sikhadenge-whatsapp-agent}"
SERVICE_NAME="${SERVICE_NAME:-sikhadenge-email-automation-scheduler}"
EXPECTED_OLD_SHA="${EXPECTED_OLD_SHA:?EXPECTED_OLD_SHA required}"
TARGET_REF="${TARGET_REF:?TARGET_REF required}"
TARGET_SHA="${TARGET_SHA:?TARGET_SHA required}"
RUN_ID="${RUN_ID:-email-p0-prod-align-$(date -u +%Y%m%dT%H%M%SZ)}"
BACKUP_ROOT="${BACKUP_ROOT:-/root/sikhadenge-backups}"
BACKUP="$BACKUP_ROOT/$RUN_ID"
WORKTREE="/tmp/$RUN_ID"
STAGE_APP="$WORKTREE/apps/whatsapp-agent-dashboard"
ENV_FILE="$APP/.env"
DIRTY_INTERNAL="apps/whatsapp-agent-dashboard/scripts/email-automation-production-internal-test.sh"
DIRTY_INBOUND="apps/whatsapp-agent-dashboard/scripts/email-inbound-production-readiness.ts"
EXPECTED_INTERNAL_BLOB="a04e7aa5942cc212413d90a862c600722f2a90b1"
EXPECTED_INBOUND_BLOB="17afac5d654af11c90890dad36969d0d76cd9583"
EXPECTED_E6E7_WORKFLOW_BLOB="139bb67729d9bce069810fb633ee60526bccd122"
RUNTIME_APP=""
PRE_DIRTY=false
SCHEDULER_STOPPED=false
ADVANCED=false
SWAPPED_APP=false
SWAPPED_RUNTIME=false

fail(){ printf 'FAIL: %s\n' "$*" >&2; exit 1; }

cleanup(){
  git -C "$ROOT" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  rm -rf "$WORKTREE" >/dev/null 2>&1 || true
}

restore_known_dirty(){
  if [[ "$PRE_DIRTY" == true ]]; then
    cp -a "$BACKUP/email-automation-production-internal-test.sh.before" "$ROOT/$DIRTY_INTERNAL" || return 1
    cp -a "$BACKUP/email-inbound-production-readiness.ts.before" "$ROOT/$DIRTY_INBOUND" || return 1
  fi
}

rollback(){
  rc=$?
  trap - ERR INT TERM
  set +e
  printf 'EMAIL_P0_PROD_ALIGN_ROLLBACK=BEGIN exit_code=%s\n' "$rc" >&2

  if [[ "$SCHEDULER_STOPPED" == true ]]; then
    APPLY=1 SERVICE_NAME="$SERVICE_NAME" bash "$APP/scripts/email-automation-scheduler-deactivate.sh" >/dev/null 2>&1 || true
  fi

  if [[ "$SWAPPED_RUNTIME" == true && -n "$RUNTIME_APP" && -d "$BACKUP/.next.runtime.before" ]]; then
    rm -rf "$RUNTIME_APP/.next"
    mv "$BACKUP/.next.runtime.before" "$RUNTIME_APP/.next"
  fi
  if [[ "$SWAPPED_APP" == true && -d "$BACKUP/.next.app.before" ]]; then
    rm -rf "$APP/.next"
    mv "$BACKUP/.next.app.before" "$APP/.next"
  fi

  if [[ "$ADVANCED" == true ]]; then
    git -C "$ROOT" reset --hard "$EXPECTED_OLD_SHA" >/dev/null 2>&1 || true
  fi
  restore_known_dirty || true

  if [[ "$SWAPPED_APP" == true || "$SWAPPED_RUNTIME" == true || "$ADVANCED" == true ]]; then
    pm2 restart "$PROCESS" >/dev/null 2>&1 || true
  fi

  if [[ "$SCHEDULER_STOPPED" == true ]]; then
    APPLY=1 \
      EXPECTED_RELEASE_SHA="$EXPECTED_OLD_SHA" \
      APP_DIR="$APP" \
      ENV_FILE="$ENV_FILE" \
      SERVICE_NAME="$SERVICE_NAME" \
      bash "$APP/scripts/email-automation-scheduler-activate.sh" >/dev/null 2>&1 || true
  fi

  cleanup
  printf 'STATUS=ROLLED_BACK\nEXIT_CODE=%s\nEXPECTED_OLD_SHA=%s\nTARGET_SHA=%s\n' "$rc" "$EXPECTED_OLD_SHA" "$TARGET_SHA" > "$BACKUP/align-result.txt" 2>/dev/null || true
  chmod 600 "$BACKUP/align-result.txt" 2>/dev/null || true
  printf 'EMAIL_P0_PROD_ALIGN_ROLLBACK=COMPLETE\n' >&2
  exit "$rc"
}
trap rollback ERR INT TERM

[[ "$(id -u)" == "0" ]] || fail "production alignment requires root"
[[ "$EXPECTED_OLD_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "EXPECTED_OLD_SHA must be a full SHA"
[[ "$TARGET_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "TARGET_SHA must be a full SHA"
[[ -d "$ROOT/.git" || -f "$ROOT/.git" ]] || fail "ROOT is not a git checkout"
[[ -f "$APP/package.json" && -f "$ENV_FILE" ]] || fail "Email app or env is missing"
command -v git >/dev/null
command -v node >/dev/null
command -v npm >/dev/null
command -v pm2 >/dev/null
command -v systemctl >/dev/null
command -v curl >/dev/null

install -d -m 700 "$BACKUP"
cd "$ROOT"
CURRENT_SHA="$(git rev-parse HEAD)"
printf 'EMAIL_P0_PROD_ALIGN_BEGIN\nCURRENT_SHA=%s\nTARGET_SHA=%s\n' "$CURRENT_SHA" "$TARGET_SHA"
[[ "$CURRENT_SHA" == "$EXPECTED_OLD_SHA" ]] || fail "live source moved from expected old SHA"

expected_dirty="$(printf '%s\n%s\n' " M $DIRTY_INTERNAL" " M $DIRTY_INBOUND" | sort)"
actual_dirty="$(git status --porcelain --untracked-files=no | sed '/^$/d' | sort)"
if [[ -z "$actual_dirty" ]]; then
  printf 'TRACKED_DIRTY_PRE=CLEAN\n'
elif [[ "$actual_dirty" == "$expected_dirty" ]]; then
  PRE_DIRTY=true
  printf 'TRACKED_DIRTY_PRE=KNOWN_TWO_EMAIL_FILES\n'
else
  printf 'TRACKED_DIRTY_UNEXPECTED_BEGIN\n%s\nTRACKED_DIRTY_UNEXPECTED_END\n' "$actual_dirty" >&2
  fail "unexpected tracked production drift"
fi

git fetch --no-tags origin "$TARGET_REF"
[[ "$(git rev-parse FETCH_HEAD)" == "$TARGET_SHA" ]] || fail "TARGET_REF does not resolve to pinned TARGET_SHA"
[[ "$(git rev-parse "${TARGET_SHA}^")" == "$EXPECTED_OLD_SHA" ]] || fail "target is not a single direct child of the live SHA"

expected_diff="$(cat <<'LIST' | sort
.github/workflows/whatsapp-agent-email-e6e7-production-readiness.yml
apps/whatsapp-agent-dashboard/.env.example
apps/whatsapp-agent-dashboard/modules/email-automation/application/automation-send-policy.ts
apps/whatsapp-agent-dashboard/modules/email-automation/application/deliverability-guardrails.ts
apps/whatsapp-agent-dashboard/modules/email-automation/docs/phase-d-deliverability-guardrails.md
apps/whatsapp-agent-dashboard/modules/email-automation/tests/automation-dispatcher.test.ts
apps/whatsapp-agent-dashboard/modules/email-automation/tests/deliverability-guardrails.test.ts
apps/whatsapp-agent-dashboard/scripts/email-automation-deliverability-preflight.ts
apps/whatsapp-agent-dashboard/scripts/email-automation-production-dryrun-activate.sh
apps/whatsapp-agent-dashboard/scripts/email-automation-production-internal-test.sh
apps/whatsapp-agent-dashboard/scripts/email-automation-production-preflight.sh
apps/whatsapp-agent-dashboard/scripts/email-inbound-production-readiness.ts
apps/whatsapp-agent-dashboard/tests/email-automation-deliverability-preflight-policy.test.sh
apps/whatsapp-agent-dashboard/tests/email-automation-production-dryrun-activation-policy.test.sh
apps/whatsapp-agent-dashboard/tests/email-automation-production-preflight-policy.test.sh
LIST
)"
actual_diff="$(git diff --name-only "$EXPECTED_OLD_SHA" "$TARGET_SHA" | sort)"
printf 'TARGET_DIFF_BEGIN\n%s\nTARGET_DIFF_END\n' "$actual_diff"
[[ "$actual_diff" == "$expected_diff" ]] || fail "target diff escaped Email P0 allowlist"

[[ "$(git show "$TARGET_SHA:$DIRTY_INTERNAL" | git hash-object --stdin)" == "$EXPECTED_INTERNAL_BLOB" ]] || fail "target internal-test blob mismatch"
[[ "$(git show "$TARGET_SHA:$DIRTY_INBOUND" | git hash-object --stdin)" == "$EXPECTED_INBOUND_BLOB" ]] || fail "target inbound-readiness blob mismatch"
[[ "$(git show "$TARGET_SHA:.github/workflows/whatsapp-agent-email-e6e7-production-readiness.yml" | git hash-object --stdin)" == "$EXPECTED_E6E7_WORKFLOW_BLOB" ]] || fail "bounded E6/E7 workflow blob mismatch"
[[ "$(git show "$TARGET_SHA:apps/whatsapp-agent-dashboard/modules/email-automation/application/automation-send-policy.ts" | git hash-object --stdin)" == "c1470249f17887e90b2ea81dcd9aec97c886b935" ]] || fail "automation send-policy blob mismatch"
[[ "$(git show "$TARGET_SHA:apps/whatsapp-agent-dashboard/modules/email-automation/application/deliverability-guardrails.ts" | git hash-object --stdin)" == "9e20ec8ac1b7b646b05a6f15c862c9069dfbe43e" ]] || fail "deliverability guardrail blob mismatch"
[[ "$(git show "$TARGET_SHA:apps/whatsapp-agent-dashboard/scripts/email-automation-production-dryrun-activate.sh" | git hash-object --stdin)" == "48841986911da313a6e1058bfc3f6cc7eec7b061" ]] || fail "DRY_RUN activation blob mismatch"
[[ "$(git show "$TARGET_SHA:apps/whatsapp-agent-dashboard/scripts/email-automation-production-preflight.sh" | git hash-object --stdin)" == "2e8186fb189256d399cfbd4f24d5464e7a081a15" ]] || fail "production preflight blob mismatch"

if [[ "$PRE_DIRTY" == true ]]; then
  [[ "$(git hash-object "$ROOT/$DIRTY_INTERNAL")" == "$EXPECTED_INTERNAL_BLOB" ]] || fail "live dirty internal-test content is not the reviewed target blob"
  [[ "$(git hash-object "$ROOT/$DIRTY_INBOUND")" == "$EXPECTED_INBOUND_BLOB" ]] || fail "live dirty inbound-readiness content is not the reviewed target blob"
  cp -a "$ROOT/$DIRTY_INTERNAL" "$BACKUP/email-automation-production-internal-test.sh.before"
  cp -a "$ROOT/$DIRTY_INBOUND" "$BACKUP/email-inbound-production-readiness.ts.before"
fi

set -a
source "$ENV_FILE"
set +a
[[ "${EMAIL_RUNTIME_ENABLED:-false}" == "true" ]] || fail "email runtime is not enabled"
[[ "${EMAIL_RUNTIME_MODE:-}" == "DRY_RUN" ]] || fail "email runtime is not DRY_RUN"
[[ "${EMAIL_EXTERNAL_WRITES_ENABLED:-true}" == "false" ]] || fail "external email writes are not disabled"
printf 'RUNTIME_PRECHECK=DRY_RUN_EXTERNAL_WRITES_OFF\n'

pm2_json="$(pm2 jlist)"
IFS='|' read -r PRE_PM2_PID PRE_PM2_STATUS PRE_PM2_CWD < <(
  printf '%s' "$pm2_json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s||"[]").find(x=>x.name==="sikhadenge-whatsapp-agent");process.stdout.write((p?[p.pid||"",p.pm2_env?.status||"",p.pm2_env?.pm_cwd||""].join("|"):"||")+"\n")})'
)
[[ -n "$PRE_PM2_PID" && "$PRE_PM2_STATUS" == "online" ]] || fail "PM2 production process is not online"
RUNTIME_APP="${PRE_PM2_CWD:-$APP}"
case "$RUNTIME_APP" in /var/www/sikhadenge-whatsapp-agent/*) ;; *) fail "unexpected PM2 runtime cwd: $RUNTIME_APP" ;; esac
[[ -d "$APP/.next" && -d "$RUNTIME_APP/.next" ]] || fail "current production build is missing"
PRE_APP_BUILD_ID="$(cat "$APP/.next/BUILD_ID")"
PRE_RUNTIME_BUILD_ID="$(cat "$RUNTIME_APP/.next/BUILD_ID")"
[[ "$PRE_APP_BUILD_ID" == "$PRE_RUNTIME_BUILD_ID" ]] || fail "source/runtime build IDs differ before deploy"
printf 'PRE_PM2_PID=%s\nPRE_PM2_CWD=%s\nPRE_BUILD_ID=%s\n' "$PRE_PM2_PID" "$RUNTIME_APP" "$PRE_APP_BUILD_ID"

cleanup
git worktree add --detach "$WORKTREE" "$TARGET_SHA" >/dev/null
ln -s "$APP/node_modules" "$STAGE_APP/node_modules"
ln -s "$ENV_FILE" "$STAGE_APP/.env"
cd "$STAGE_APP"
{
  npx tsx modules/email-automation/tests/deliverability-guardrails.test.ts
  bash tests/email-automation-deliverability-preflight-policy.test.sh
  bash tests/email-automation-production-preflight-policy.test.sh
  bash tests/email-automation-production-dryrun-activation-policy.test.sh
  bash tests/email-production-scp-bounds-policy.test.sh
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
if [[ "$PRE_DIRTY" == true ]]; then
  git restore --source=HEAD --staged --worktree -- "$DIRTY_INTERNAL" "$DIRTY_INBOUND"
fi
[[ -z "$(git status --porcelain --untracked-files=no | sed '/^$/d')" ]] || fail "tracked source did not become clean before fast-forward"
git merge --ff-only "$TARGET_SHA" > "$BACKUP/git-fast-forward.log" 2>&1
ADVANCED=true
[[ "$(git rev-parse HEAD)" == "$TARGET_SHA" ]] || fail "production source did not advance to target SHA"
[[ -z "$(git status --porcelain --untracked-files=no | sed '/^$/d')" ]] || fail "tracked source is dirty after fast-forward"

mv "$APP/.next" "$BACKUP/.next.app.before"
cp -a "$STAGE_APP/.next" "$APP/.next"
SWAPPED_APP=true
if [[ "$RUNTIME_APP" != "$APP" ]]; then
  mv "$RUNTIME_APP/.next" "$BACKUP/.next.runtime.before"
  cp -a "$STAGE_APP/.next" "$RUNTIME_APP/.next"
  SWAPPED_RUNTIME=true
fi
[[ "$(cat "$APP/.next/BUILD_ID")" == "$STAGED_BUILD_ID" ]] || fail "canonical app build swap failed"
[[ "$(cat "$RUNTIME_APP/.next/BUILD_ID")" == "$STAGED_BUILD_ID" ]] || fail "PM2 runtime build swap failed"

pm2 restart "$PROCESS" > "$BACKUP/pm2-restart.log" 2>&1
sleep 5

cd "$APP"
EMAIL_PREFLIGHT_EXPECTED_MODE=DRY_RUN \
EXPECTED_RELEASE_SHA="$TARGET_SHA" \
ENV_FILE="$ENV_FILE" \
bash scripts/email-automation-production-preflight.sh | tee "$BACKUP/preflight.log"
APPLY=1 \
EXPECTED_RELEASE_SHA="$TARGET_SHA" \
APP_DIR="$APP" \
ENV_FILE="$ENV_FILE" \
SERVICE_NAME="$SERVICE_NAME" \
bash scripts/email-automation-scheduler-activate.sh | tee "$BACKUP/activate.log"
systemctl start "${SERVICE_NAME}.service"
EXPECTED_RELEASE_SHA="$TARGET_SHA" \
ENV_FILE="$ENV_FILE" \
SERVICE_NAME="$SERVICE_NAME" \
MAX_FAILED_EVENTS=0 \
bash scripts/email-automation-scheduler-verify.sh | tee "$BACKUP/verify.log"

set -a
source "$ENV_FILE"
set +a
[[ "${EMAIL_RUNTIME_ENABLED:-false}" == "true" ]]
[[ "${EMAIL_RUNTIME_MODE:-}" == "DRY_RUN" ]]
[[ "${EMAIL_EXTERNAL_WRITES_ENABLED:-true}" == "false" ]]
[[ "$(git -C "$ROOT" rev-parse HEAD)" == "$TARGET_SHA" ]]
[[ -z "$(git -C "$ROOT" status --porcelain --untracked-files=no | sed '/^$/d')" ]]

post_pm2_json="$(pm2 jlist)"
IFS='|' read -r POST_PM2_PID POST_PM2_STATUS POST_PM2_CWD < <(
  printf '%s' "$post_pm2_json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s||"[]").find(x=>x.name==="sikhadenge-whatsapp-agent");process.stdout.write((p?[p.pid||"",p.pm2_env?.status||"",p.pm2_env?.pm_cwd||""].join("|"):"||")+"\n")})'
)
[[ -n "$POST_PM2_PID" && "$POST_PM2_STATUS" == "online" ]] || fail "PM2 process is not online after deploy"
[[ "$POST_PM2_CWD" == "$RUNTIME_APP" ]] || fail "PM2 cwd changed unexpectedly"
[[ "$(cat "$POST_PM2_CWD/.next/BUILD_ID")" == "$STAGED_BUILD_ID" ]] || fail "PM2 runtime is not serving staged build"

login_local="$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/login || true)"
case "$login_local" in 200|301|302|303|307|308) ;; *) fail "local login health failed: HTTP $login_local" ;; esac
login_public="$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' https://whatsapp.sikhadenge.in/login || true)"
[[ "$login_public" == "200" ]] || fail "public login health failed: HTTP $login_public"

[[ "$(git hash-object "$ROOT/.github/workflows/whatsapp-agent-email-e6e7-production-readiness.yml")" == "$EXPECTED_E6E7_WORKFLOW_BLOB" ]]
[[ "$(git hash-object "$APP/modules/email-automation/application/automation-send-policy.ts")" == "c1470249f17887e90b2ea81dcd9aec97c886b935" ]]
[[ "$(git hash-object "$APP/modules/email-automation/application/deliverability-guardrails.ts")" == "9e20ec8ac1b7b646b05a6f15c862c9069dfbe43e" ]]
[[ "$(git hash-object "$APP/scripts/email-automation-production-dryrun-activate.sh")" == "48841986911da313a6e1058bfc3f6cc7eec7b061" ]]
[[ "$(git hash-object "$APP/scripts/email-automation-production-preflight.sh")" == "2e8186fb189256d399cfbd4f24d5464e7a081a15" ]]
[[ "$(git hash-object "$APP/scripts/email-automation-production-internal-test.sh")" == "$EXPECTED_INTERNAL_BLOB" ]]
[[ "$(git hash-object "$APP/scripts/email-inbound-production-readiness.ts")" == "$EXPECTED_INBOUND_BLOB" ]]

printf 'STATUS=PASS\nOLD_SHA=%s\nTARGET_SHA=%s\nPRE_BUILD_ID=%s\nPOST_BUILD_ID=%s\nPM2_STATUS=online\nPM2_PID=%s\nPM2_CWD=%s\nRUNTIME_MODE=DRY_RUN\nEXTERNAL_WRITES=false\nSCHEDULER_ACTIVE=true\nTRACKED_DIRTY_AFTER=0\nLOGIN_LOCAL_HTTP=%s\nLOGIN_PUBLIC_HTTP=%s\nCOMPLETED_UTC=%s\n' \
  "$EXPECTED_OLD_SHA" "$TARGET_SHA" "$PRE_APP_BUILD_ID" "$STAGED_BUILD_ID" "$POST_PM2_PID" "$POST_PM2_CWD" "$login_local" "$login_public" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  > "$BACKUP/align-result.txt"
chmod 600 "$BACKUP"/*.log "$BACKUP/align-result.txt" 2>/dev/null || true

trap - ERR INT TERM
SCHEDULER_STOPPED=false
ADVANCED=false
SWAPPED_APP=false
SWAPPED_RUNTIME=false
rm -rf "$BACKUP/.next.app.before" "$BACKUP/.next.runtime.before"
cleanup
printf 'EMAIL_P0_PROD_ALIGN=PASS\nTARGET_SHA=%s\nBUILD_ID=%s\nRUNTIME_MODE=DRY_RUN\nEXTERNAL_WRITES=false\nSCHEDULER_ACTIVE=true\nTRACKED_DIRTY_AFTER=0\n' "$TARGET_SHA" "$STAGED_BUILD_ID"
