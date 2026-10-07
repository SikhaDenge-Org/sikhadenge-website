#!/usr/bin/env bash
set -Eeuo pipefail

: "${LIVE_APP:?LIVE_APP is required}"
: "${STAGE_APP:?STAGE_APP is required}"
: "${RELEASE_SHA:?RELEASE_SHA is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required}"

PM2_PROCESS_NAME="${PM2_PROCESS_NAME:-sikhadenge-whatsapp-agent}"
PUBLIC_URL="${PUBLIC_URL:-https://whatsapp.sikhadenge.in}"
ENV_FILE="${ENV_FILE:-${LIVE_APP}/.env}"

read_env_value() {
  local key="$1"
  local file="$2"
  node - "$file" "$key" <<'NODE'
const fs = require('node:fs');
const [file, key] = process.argv.slice(2);
if (!file || !key || !fs.existsSync(file)) process.exit(1);
const text = fs.readFileSync(file, 'utf8');
for (const rawLine of text.split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
  const separator = normalized.indexOf('=');
  if (separator < 1 || normalized.slice(0, separator).trim() !== key) continue;
  let value = normalized.slice(separator + 1).trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1);
  }
  process.stdout.write(value);
  process.exit(0);
}
process.exit(1);
NODE
}

psql_scalar() {
  psql "$DATABASE_CLI_URL" -X -v ON_ERROR_STOP=1 -Atqc "$1"
}

NEW_BUILD_ID="$(awk -F= '$1 == "NEW_BUILD_ID" {print $2}' "$BACKUP_DIR/deploy-state.txt")"
test -n "$NEW_BUILD_ID"
test "$(git -C "$LIVE_APP" rev-parse HEAD)" = "$RELEASE_SHA"
test "$(cat "$LIVE_APP/.next/BUILD_ID")" = "$NEW_BUILD_ID"

PM2_JSON_FILE="$(mktemp)"
trap 'rm -f "$PM2_JSON_FILE"' EXIT
pm2 jlist > "$PM2_JSON_FILE"
IFS='|' read -r pm2_status pm2_unstable pm2_restarts pm2_cwd pm2_port < <(
  node - "$PM2_PROCESS_NAME" "$PM2_JSON_FILE" <<'NODE'
const fs = require('node:fs');
const [name, file] = process.argv.slice(2);
const processEntry = JSON.parse(fs.readFileSync(file, 'utf8')).find((entry) => entry.name === name);
if (!processEntry) process.exit(1);
const status = String(processEntry.pm2_env?.status || '');
const unstable = String(processEntry.pm2_env?.unstable_restarts ?? 0);
const restarts = String(processEntry.pm2_env?.restart_time ?? 0);
const cwd = String(processEntry.pm2_env?.pm_cwd || '');
const port = String(processEntry.pm2_env?.PORT || processEntry.pm2_env?.port || '3100');
process.stdout.write(`${status}|${unstable}|${restarts}|${cwd}|${port}\n`);
NODE
)

test "$pm2_status" = "online"
test "$pm2_unstable" = "0"
test -n "$pm2_port"
printf 'PM2_CWD=%s\n' "$pm2_cwd"
printf 'PM2_PORT=%s\n' "$pm2_port"

public_login_html="$(curl -sS --max-time 20 "${PUBLIC_URL%/}/login")"
local_login_html="$(curl -sS --max-time 20 "http://127.0.0.1:${pm2_port}/login")"

public_new_marker=false
public_old_marker=false
local_new_marker=false
local_old_marker=false
if grep -Fq 'login-page01-split-v1' <<<"$public_login_html"; then public_new_marker=true; fi
if grep -Fq 'AI MEETS HUMAN POTENTIAL' <<<"$public_login_html"; then public_old_marker=true; fi
if grep -Fq 'login-page01-split-v1' <<<"$local_login_html"; then local_new_marker=true; fi
if grep -Fq 'AI MEETS HUMAN POTENTIAL' <<<"$local_login_html"; then local_old_marker=true; fi
printf 'PUBLIC_LOGIN_NEW_MARKER=%s\n' "$public_new_marker"
printf 'PUBLIC_LOGIN_OLD_MARKER=%s\n' "$public_old_marker"
printf 'LOCAL_LOGIN_NEW_MARKER=%s\n' "$local_new_marker"
printf 'LOCAL_LOGIN_OLD_MARKER=%s\n' "$local_old_marker"

if command -v nginx >/dev/null 2>&1; then
  nginx_proxy_line="$(nginx -T 2>/dev/null | awk '/server_name[[:space:]]+whatsapp\.sikhadenge\.in/{found=1} found && /proxy_pass/{gsub(/^[[:space:]]+/, ""); print; exit}')"
  printf 'NGINX_WHATSAPP_PROXY=%s\n' "${nginx_proxy_line:-not-found}"
fi

login_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "${PUBLIC_URL%/}/login")"
inbox_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "${PUBLIC_URL%/}/inbox")"
contacts_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "${PUBLIC_URL%/}/contacts")"
analytics_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "${PUBLIC_URL%/}/analytics")"

test "$login_status" = "200"
test "$local_new_marker" = "true"
test "$public_new_marker" = "true"
test "$local_old_marker" = "false"
test "$public_old_marker" = "false"
[[ "$inbox_status" == "302" || "$inbox_status" == "307" ]]
[[ "$contacts_status" == "302" || "$contacts_status" == "307" ]]
[[ "$analytics_status" == "302" || "$analytics_status" == "307" ]]

VERIFY_TOKEN="$(read_env_value WHATSAPP_VERIFY_TOKEN "$ENV_FILE")"
challenge="$(curl -sS --get --max-time 20 \
  "${PUBLIC_URL%/}/api/webhooks/whatsapp" \
  --data-urlencode 'hub.mode=subscribe' \
  --data-urlencode "hub.verify_token=$VERIFY_TOKEN" \
  --data-urlencode 'hub.challenge=987654')"
test "$challenge" = "987654"

DATABASE_URL="$(read_env_value DATABASE_URL "$ENV_FILE")"
DATABASE_CLI_URL="$(node "$STAGE_APP/scripts/prisma-postgres-cli-url.mjs" "$DATABASE_URL")"
failed_migrations="$(psql_scalar 'SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL;')"
baseline_count="$(psql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20260802000000_baseline_existing_schema' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
additive_count="$(psql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20260802174500_add_engageos_security_persistence' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
phase16a_count="$(psql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20260911150000_add_phase16a_saas_persistence' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
user_count="$(psql_scalar 'SELECT COUNT(*) FROM "DashboardUser";')"
membership_count="$(psql_scalar 'SELECT COUNT(*) FROM "EngageWorkspaceMembership" WHERE "workspaceId" = '\''engagews_default'\'';')"
flag_count="$(psql_scalar "SELECT COUNT(*) FROM \"EngageFeatureFlag\" WHERE \"workspaceId\" = 'engagews_default' AND key IN ('engageos.route_permissions','engageos.outbound_policy','engageos.webhook_replay');")"
enabled_flag_count="$(psql_scalar "SELECT COUNT(*) FROM \"EngageFeatureFlag\" WHERE \"workspaceId\" = 'engagews_default' AND enabled = true;")"

test "$failed_migrations" = "0"
test "$baseline_count" = "1"
test "$additive_count" = "1"
test "$phase16a_count" = "1"
test "$membership_count" = "$user_count"
test "$flag_count" = "3"
test "$enabled_flag_count" = "0"

ERROR_LOG="/root/.pm2/logs/${PM2_PROCESS_NAME}-error.log"
ERROR_SIZE_BEFORE="$(cat "$BACKUP_DIR/error-log-size-before.txt")"
NEW_ERROR_LOG="$BACKUP_DIR/pm2-errors-after.txt"
if [[ -f "$ERROR_LOG" ]]; then
  current_size="$(stat -c '%s' "$ERROR_LOG")"
  if (( current_size > ERROR_SIZE_BEFORE )); then
    tail -c "+$((ERROR_SIZE_BEFORE + 1))" "$ERROR_LOG" > "$NEW_ERROR_LOG"
  else
    : > "$NEW_ERROR_LOG"
  fi
else
  : > "$NEW_ERROR_LOG"
fi
chmod 600 "$NEW_ERROR_LOG"
if grep -Eqi 'Unhandled|PrismaClientInitializationError|EADDRINUSE|FATAL|uncaught exception' "$NEW_ERROR_LOG"; then
  cat "$NEW_ERROR_LOG" >&2
  printf 'FAIL: fatal PM2 error detected after activation\n' >&2
  exit 1
fi

cat > "$BACKUP_DIR/post-deploy-evidence.txt" <<EOF
RELEASE_SHA=$RELEASE_SHA
BUILD_ID=$NEW_BUILD_ID
PM2_STATUS=$pm2_status
PM2_RESTARTS=$pm2_restarts
PM2_UNSTABLE_RESTARTS=$pm2_unstable
PM2_CWD=$pm2_cwd
PM2_PORT=$pm2_port
LOGIN_HTTP=$login_status
PUBLIC_LOGIN_NEW_MARKER=$public_new_marker
PUBLIC_LOGIN_OLD_MARKER=$public_old_marker
LOCAL_LOGIN_NEW_MARKER=$local_new_marker
LOCAL_LOGIN_OLD_MARKER=$local_old_marker
INBOX_HTTP=$inbox_status
CONTACTS_HTTP=$contacts_status
ANALYTICS_HTTP=$analytics_status
WEBHOOK_CHALLENGE=$challenge
BASELINE_COUNT=$baseline_count
ADDITIVE_COUNT=$additive_count
PHASE16A_COUNT=$phase16a_count
DASHBOARD_USER_COUNT=$user_count
DEFAULT_MEMBERSHIP_COUNT=$membership_count
FEATURE_FLAGS_ENABLED=$enabled_flag_count
VERIFIED_UTC=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
EOF
chmod 600 "$BACKUP_DIR/post-deploy-evidence.txt"

cat "$BACKUP_DIR/post-deploy-evidence.txt"
printf 'PASS: POST_DEPLOY_VERIFICATION_COMPLETE\n'
