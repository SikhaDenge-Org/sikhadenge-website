#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=/var/www/sikhadenge-whatsapp-agent/source
APP="$ROOT/apps/whatsapp-agent-dashboard"
PROCESS=sikhadenge-whatsapp-agent
EXPECTED_OLD_SHA="${EXPECTED_OLD_SHA:?EXPECTED_OLD_SHA required}"
TARGET_REF="${TARGET_REF:?TARGET_REF required}"
TARGET_SHA="${TARGET_SHA:?TARGET_SHA required}"
EXPECTED_GMAIL_MIME_BLOB="${EXPECTED_GMAIL_MIME_BLOB:?required}"
EXPECTED_UNSUB_ROUTE_BLOB="${EXPECTED_UNSUB_ROUTE_BLOB:?required}"
EXPECTED_UNSUB_SERVICE_BLOB="${EXPECTED_UNSUB_SERVICE_BLOB:?required}"
REVIEWED_EMAIL_INTERNAL_TEST_SHA256="${REVIEWED_EMAIL_INTERNAL_TEST_SHA256:?required}"
REVIEWED_EMAIL_READINESS_SHA256="${REVIEWED_EMAIL_READINESS_SHA256:?required}"
RUN_ID="email-rfc8058-$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="/root/sikhadenge-backups/$RUN_ID"
WORKTREE="/tmp/$RUN_ID"
STAGE_APP="$WORKTREE/apps/whatsapp-agent-dashboard"
RUNTIME_APP=""
swapped_app=false
swapped_runtime=false
advanced=false

cleanup() {
  git -C "$ROOT" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  rm -rf "$WORKTREE" >/dev/null 2>&1 || true
}

rollback() {
  rc=$?
  trap - ERR INT TERM
  set +e
  if [[ "$swapped_runtime" = true && -n "$RUNTIME_APP" && -d "$BACKUP/.next.runtime.before" ]]; then
    rm -rf "$RUNTIME_APP/.next"
    mv "$BACKUP/.next.runtime.before" "$RUNTIME_APP/.next"
  fi
  if [[ "$swapped_app" = true && -d "$BACKUP/.next.app.before" ]]; then
    rm -rf "$APP/.next"
    mv "$BACKUP/.next.app.before" "$APP/.next"
  fi
  if [[ "$advanced" = true ]]; then
    git -C "$ROOT" reset --keep "$EXPECTED_OLD_SHA" >/dev/null 2>&1 || true
  fi
  pm2 restart "$PROCESS" >/dev/null 2>&1 || true
  cleanup
  printf 'EMAIL_RFC8058_ROLLBACK=true exit_code=%s\n' "$rc"
  exit "$rc"
}
trap rollback ERR INT TERM

test "$(id -u)" = 0
cd "$ROOT"
current_sha="$(git rev-parse HEAD)"
printf 'PRE_DEPLOY_SHA=%s\n' "$current_sha"
test "$current_sha" = "$EXPECTED_OLD_SHA"

expected_dirty="$(printf '%s\n%s\n' \
  ' M apps/whatsapp-agent-dashboard/scripts/email-automation-production-internal-test.sh' \
  ' M apps/whatsapp-agent-dashboard/scripts/email-inbound-production-readiness.ts' | sort)"
actual_dirty="$(git status --porcelain --untracked-files=no | sed '/^$/d' | sort)"
printf 'TRACKED_DIRTY_BEGIN\n%s\nTRACKED_DIRTY_END\n' "$actual_dirty"
test "$actual_dirty" = "$expected_dirty"
test "$(sha256sum "$APP/scripts/email-automation-production-internal-test.sh" | awk '{print $1}')" = "$REVIEWED_EMAIL_INTERNAL_TEST_SHA256"
test "$(sha256sum "$APP/scripts/email-inbound-production-readiness.ts" | awk '{print $1}')" = "$REVIEWED_EMAIL_READINESS_SHA256"
printf 'REVIEWED_EMAIL_DRIFT_PRESERVED=true\n'

set -a
source "$APP/.env"
set +a
test "${EMAIL_RUNTIME_MODE:-}" = DRY_RUN
test "${EMAIL_RUNTIME_ENABLED:-false}" = true
test "${EMAIL_EXTERNAL_WRITES_ENABLED:-true}" = false
printf 'EMAIL_RUNTIME_PRECHECK=DRY_RUN_EXTERNAL_WRITES_OFF\n'

pm2_json="$(pm2 jlist)"
IFS='|' read -r pid status cwd < <(
  printf '%s' "$pm2_json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s||"[]").find(x=>x.name==="sikhadenge-whatsapp-agent");process.stdout.write(p?[p.pid||"",p.pm2_env?.status||"",p.pm2_env?.pm_cwd||""].join("|"):"||")})'
)
test -n "$pid"
test "$status" = online
RUNTIME_APP="${cwd:-$APP}"
if [[ -z "$RUNTIME_APP" ]]; then RUNTIME_APP="$APP"; fi
case "$RUNTIME_APP" in
  /var/www/sikhadenge-whatsapp-agent/*) ;;
  *) printf 'FAIL: unexpected PM2 runtime cwd: %s\n' "$RUNTIME_APP" >&2; exit 21 ;;
esac
test -d "$RUNTIME_APP"
test -d "$APP/.next"
test -d "$RUNTIME_APP/.next"
old_app_build="$(cat "$APP/.next/BUILD_ID")"
old_runtime_build="$(cat "$RUNTIME_APP/.next/BUILD_ID")"
test -n "$old_app_build"
test -n "$old_runtime_build"
printf 'PRE_DEPLOY_PM2_PID=%s\n' "$pid"
printf 'PRE_DEPLOY_PM2_STATUS=%s\n' "$status"
printf 'PRE_DEPLOY_RUNTIME_APP=%s\n' "$RUNTIME_APP"
printf 'PRE_DEPLOY_APP_BUILD_ID=%s\n' "$old_app_build"
printf 'PRE_DEPLOY_RUNTIME_BUILD_ID=%s\n' "$old_runtime_build"

git fetch --no-tags origin "$TARGET_REF"
test "$(git rev-parse FETCH_HEAD)" = "$TARGET_SHA"
actual_diff="$(git diff --name-only "$EXPECTED_OLD_SHA" "$TARGET_SHA" | sort)"
expected_diff="$(printf '%s\n%s\n%s\n%s\n%s\n' \
  '.github/workflows/email-rfc8058-live-hotfix.yml' \
  'apps/whatsapp-agent-dashboard/app/api/email/unsubscribe/route.ts' \
  'apps/whatsapp-agent-dashboard/modules/email-automation/campaigns/unsubscribe.ts' \
  'apps/whatsapp-agent-dashboard/modules/email-automation/messaging/gmail-mime.ts' \
  'apps/whatsapp-agent-dashboard/scripts/email-rfc8058-live-deploy.sh' | sort)"
printf 'HOTFIX_DIFF_BEGIN\n%s\nHOTFIX_DIFF_END\n' "$actual_diff"
test "$actual_diff" = "$expected_diff"
test "$(git show "$TARGET_SHA:apps/whatsapp-agent-dashboard/modules/email-automation/messaging/gmail-mime.ts" | git hash-object --stdin)" = "$EXPECTED_GMAIL_MIME_BLOB"
test "$(git show "$TARGET_SHA:apps/whatsapp-agent-dashboard/app/api/email/unsubscribe/route.ts" | git hash-object --stdin)" = "$EXPECTED_UNSUB_ROUTE_BLOB"
test "$(git show "$TARGET_SHA:apps/whatsapp-agent-dashboard/modules/email-automation/campaigns/unsubscribe.ts" | git hash-object --stdin)" = "$EXPECTED_UNSUB_SERVICE_BLOB"
printf 'REVIEWED_RUNTIME_BLOBS=PASS\n'

install -d -m 700 "$BACKUP"
git worktree add --detach "$WORKTREE" "$TARGET_SHA" >/dev/null
ln -s "$APP/node_modules" "$STAGE_APP/node_modules"
ln -s "$APP/.env" "$STAGE_APP/.env"
cd "$STAGE_APP"
NEXT_TELEMETRY_DISABLED=1 npm run build > "$BACKUP/build.log" 2>&1
new_build="$(cat "$STAGE_APP/.next/BUILD_ID")"
test -n "$new_build"
test "$new_build" != "$old_runtime_build"
printf 'STAGED_BUILD_ID=%s\n' "$new_build"

cd "$ROOT"
git merge --ff-only "$TARGET_SHA"
advanced=true
test "$(git rev-parse HEAD)" = "$TARGET_SHA"
test "$(git status --porcelain --untracked-files=no | sed '/^$/d' | sort)" = "$expected_dirty"

mv "$APP/.next" "$BACKUP/.next.app.before"
cp -a "$STAGE_APP/.next" "$APP/.next"
swapped_app=true
if [[ "$RUNTIME_APP" != "$APP" ]]; then
  mv "$RUNTIME_APP/.next" "$BACKUP/.next.runtime.before"
  cp -a "$STAGE_APP/.next" "$RUNTIME_APP/.next"
  swapped_runtime=true
fi

test "$(cat "$APP/.next/BUILD_ID")" = "$new_build"
test "$(cat "$RUNTIME_APP/.next/BUILD_ID")" = "$new_build"
pm2 restart "$PROCESS" >/dev/null
sleep 5

pm2_json="$(pm2 jlist)"
IFS='|' read -r post_pid post_status post_cwd < <(
  printf '%s' "$pm2_json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s||"[]").find(x=>x.name==="sikhadenge-whatsapp-agent");process.stdout.write(p?[p.pid||"",p.pm2_env?.status||"",p.pm2_env?.pm_cwd||""].join("|"):"||")})'
)
test -n "$post_pid"
test "$post_status" = online
post_runtime_app="${post_cwd:-$APP}"
if [[ -z "$post_runtime_app" ]]; then post_runtime_app="$APP"; fi
test "$post_runtime_app" = "$RUNTIME_APP"
test "$(cat "$APP/.next/BUILD_ID")" = "$new_build"
test "$(cat "$RUNTIME_APP/.next/BUILD_ID")" = "$new_build"

set -a
source "$APP/.env"
set +a
test "${EMAIL_RUNTIME_MODE:-}" = DRY_RUN
test "${EMAIL_RUNTIME_ENABLED:-false}" = true
test "${EMAIL_EXTERNAL_WRITES_ENABLED:-true}" = false

login="$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/login || true)"
case "$login" in 200|301|302|303|307|308) ;; *) exit 31 ;; esac
get_code="$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/api/email/unsubscribe || true)"
test "$get_code" = 400
post_code="$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/x-www-form-urlencoded' --data 'List-Unsubscribe=One-Click' http://127.0.0.1:3100/api/email/unsubscribe || true)"
test "$post_code" = 400

test "$(git hash-object "$APP/modules/email-automation/messaging/gmail-mime.ts")" = "$EXPECTED_GMAIL_MIME_BLOB"
test "$(git hash-object "$APP/app/api/email/unsubscribe/route.ts")" = "$EXPECTED_UNSUB_ROUTE_BLOB"
test "$(git hash-object "$APP/modules/email-automation/campaigns/unsubscribe.ts")" = "$EXPECTED_UNSUB_SERVICE_BLOB"
grep -q 'List-Unsubscribe-Post: List-Unsubscribe=One-Click' "$APP/modules/email-automation/messaging/gmail-mime.ts"
grep -q 'export async function POST' "$APP/app/api/email/unsubscribe/route.ts"

printf 'POST_DEPLOY_SHA=%s\n' "$(git rev-parse HEAD)"
printf 'POST_DEPLOY_APP_BUILD_ID=%s\n' "$(cat "$APP/.next/BUILD_ID")"
printf 'POST_DEPLOY_RUNTIME_BUILD_ID=%s\n' "$(cat "$RUNTIME_APP/.next/BUILD_ID")"
printf 'POST_DEPLOY_RUNTIME_APP=%s\n' "$RUNTIME_APP"
printf 'POST_DEPLOY_PM2_STATUS=%s\n' "$post_status"
printf 'LOGIN_HTTP=%s\n' "$login"
printf 'UNSUBSCRIBE_GET_NO_TOKEN_HTTP=%s\n' "$get_code"
printf 'UNSUBSCRIBE_POST_NO_TOKEN_HTTP=%s\n' "$post_code"
printf 'EMAIL_RUNTIME_POSTCHECK=DRY_RUN_EXTERNAL_WRITES_OFF\n'
printf 'EXTERNAL_EMAIL_SENT=false\n'
printf 'EMAIL_RFC8058_LIVE_DEPLOY=PASS\n'

trap - ERR INT TERM
swapped_app=false
swapped_runtime=false
advanced=false
rm -rf "$BACKUP/.next.app.before" "$BACKUP/.next.runtime.before"
cleanup
