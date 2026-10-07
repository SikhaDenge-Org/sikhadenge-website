#!/usr/bin/env bash
set -Eeuo pipefail

: "${LIVE_APP:?LIVE_APP is required}"
: "${EXPECTED_LIVE_SHA:?EXPECTED_LIVE_SHA is required}"
: "${RUN_ID:?RUN_ID is required}"

PM2_PROCESS_NAME="${PM2_PROCESS_NAME:-sikhadenge-whatsapp-agent}"
PUBLIC_URL="${PUBLIC_URL:-https://whatsapp.sikhadenge.in}"
ENV_FILE="${ENV_FILE:-${LIVE_APP}/.env}"
BACKUP_ROOT="${BACKUP_ROOT:-/root/sikhadenge-backups}"
BACKUP_DIR="${BACKUP_ROOT}/route-permissions-${RUN_ID}"
RESULT_FILE="${BACKUP_DIR}/route-permissions-result.txt"
MASTER_KEY="ENGAGEOS_SECURITY_PERSISTENCE_ENABLED"
ROLLBACK_REQUIRED=0

read_env_value() {
  local key="$1"
  local file="$2"
  node - "$file" "$key" <<'NODE'
const fs = require("node:fs");
const [file, key] = process.argv.slice(2);
if (!file || !key || !fs.existsSync(file)) process.exit(0);
let value = "";
for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) continue;
  const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
  const separator = normalized.indexOf("=");
  if (separator < 1 || normalized.slice(0, separator).trim() !== key) continue;
  value = normalized.slice(separator + 1).trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) value = value.slice(1, -1);
}
process.stdout.write(value);
NODE
}

write_env_value() {
  local key="$1"
  local value="$2"
  local file="$3"
  node - "$file" "$key" "$value" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const [file, key, value] = process.argv.slice(2);
if (!file || !key || value === undefined || !fs.existsSync(file)) process.exit(1);
const original = fs.readFileSync(file, "utf8");
const stat = fs.statSync(file);
const kept = original.split(/\r?\n/).filter((rawLine) => {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) return true;
  const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
  const separator = normalized.indexOf("=");
  return separator < 1 || normalized.slice(0, separator).trim() !== key;
});
while (kept.length > 0 && kept[kept.length - 1] === "") kept.pop();
kept.push(`${key}=${value}`, "");
const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
fs.writeFileSync(temporary, kept.join("\n"), { mode: stat.mode });
fs.chmodSync(temporary, stat.mode);
fs.chownSync(temporary, stat.uid, stat.gid);
fs.renameSync(temporary, file);
NODE
}

normalize_boolean() {
  local value="${1:-}"
  value="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]' | xargs)"
  case "$value" in
    true|1|yes|on) printf 'true' ;;
    false|0|no|off|"") printf 'false' ;;
    *) printf 'invalid:%s' "$value" ;;
  esac
}

pm2_field() {
  local field="$1"
  pm2 jlist | node -e '
let input = "";
const [processName, field] = process.argv.slice(1);
process.stdin.on("data", (chunk) => input += chunk);
process.stdin.on("end", () => {
  const app = JSON.parse(input).find((item) => item?.name === processName);
  const value = field === "master"
    ? app?.pm2_env?.ENGAGEOS_SECURITY_PERSISTENCE_ENABLED
    : app?.pm2_env?.status;
  process.stdout.write(String(value ?? ""));
});
' "$PM2_PROCESS_NAME" "$field"
}

prepare_database_url() {
  DATABASE_URL="$(read_env_value DATABASE_URL "$ENV_FILE")"
  test -n "$DATABASE_URL"
  DATABASE_CLI_URL="$(node "$LIVE_APP/scripts/prisma-postgres-cli-url.mjs" "$DATABASE_URL")"
  test -n "$DATABASE_CLI_URL"
  export DATABASE_URL DATABASE_CLI_URL
}

psql_scalar() {
  psql "$DATABASE_CLI_URL" -X -v ON_ERROR_STOP=1 -Atqc "$1"
}

rollback_on_error() {
  local exit_code=$?
  trap - ERR
  printf 'FAIL: ROUTE_PERMISSIONS_ACTIVATION_FAILED code=%s\n' "$exit_code" >&2

  if [[ "$ROLLBACK_REQUIRED" == "1" ]]; then
    psql "$DATABASE_CLI_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<'SQL' || true
UPDATE "EngageFeatureFlag"
SET "enabled" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE "workspaceId" = 'engagews_default'
  AND "key" = 'engageos.route_permissions';
SQL

    if [[ -f "$BACKUP_DIR/.env.before" ]]; then
      cp -a "$BACKUP_DIR/.env.before" "$ENV_FILE" || true
    else
      write_env_value "$MASTER_KEY" false "$ENV_FILE" || true
    fi

    ENGAGEOS_SECURITY_PERSISTENCE_ENABLED=false \
      pm2 restart "$PM2_PROCESS_NAME" --update-env >/dev/null 2>&1 || true

    {
      printf 'STATUS=ROLLED_BACK_AFTER_FAILURE\n'
      printf 'FAILED_EXIT_CODE=%s\n' "$exit_code"
      printf 'COMPLETED_UTC=%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
    } > "$BACKUP_DIR/rollback-result.txt" || true
    chmod 600 "$BACKUP_DIR/rollback-result.txt" 2>/dev/null || true
  fi

  exit "$exit_code"
}
trap rollback_on_error ERR

[[ "$EXPECTED_LIVE_SHA" =~ ^[0-9a-f]{40}$ ]]
test -f "$ENV_FILE"
cd "$LIVE_APP"
test "$(git rev-parse HEAD)" = "$EXPECTED_LIVE_SHA"
test -z "$(git status --porcelain --untracked-files=no)"
test "$(pm2_field status)" = "online"

prepare_database_url

file_master="$(normalize_boolean "$(read_env_value "$MASTER_KEY" "$ENV_FILE")")"
pm2_master="$(normalize_boolean "$(pm2_field master)")"
test "$file_master" = "false"
test "$pm2_master" = "false"

workspace_count="$(psql_scalar 'SELECT COUNT(*) FROM "EngageWorkspace" WHERE "id" = '\''engagews_default'\'' AND "isActive" = true;')"
dashboard_user_count="$(psql_scalar 'SELECT COUNT(*) FROM "DashboardUser";')"
membership_count="$(psql_scalar 'SELECT COUNT(*) FROM "EngageWorkspaceMembership" WHERE "workspaceId" = '\''engagews_default'\'';')"
active_membership_count="$(psql_scalar 'SELECT COUNT(*) FROM "EngageWorkspaceMembership" WHERE "workspaceId" = '\''engagews_default'\'' AND "isActive" = true;')"
consistency_failures="$(psql_scalar 'SELECT COUNT(*) FROM "DashboardUser" u LEFT JOIN "EngageWorkspaceMembership" m ON m."workspaceId" = '\''engagews_default'\'' AND m."userId" = u."id" WHERE m."id" IS NULL OR m."role" IS DISTINCT FROM u."role"::text OR m."isActive" IS DISTINCT FROM u."isActive" OR m."role" NOT IN ('\''ADMIN'\'','\''MANAGER'\'','\''COUNSELOR'\'','\''ANALYST'\'','\''VIEWER'\'');')"
reply_ready_count="$(psql_scalar 'SELECT COUNT(*) FROM "DashboardUser" u JOIN "EngageWorkspaceMembership" m ON m."workspaceId" = '\''engagews_default'\'' AND m."userId" = u."id" WHERE u."isActive" = true AND m."isActive" = true AND (m."role" IN ('\''ADMIN'\'','\''MANAGER'\'','\''COUNSELOR'\'') OR EXISTS (SELECT 1 FROM "EngagePermissionGrant" g WHERE g."membershipId" = m."id" AND g."permission" = '\''inbox.reply'\''));')"
active_user_count="$(psql_scalar 'SELECT COUNT(*) FROM "DashboardUser" WHERE "isActive" = true;')"
flag_count="$(psql_scalar 'SELECT COUNT(*) FROM "EngageFeatureFlag" WHERE "workspaceId" = '\''engagews_default'\'' AND "key" IN ('\''engageos.route_permissions'\'','\''engageos.outbound_policy'\'','\''engageos.webhook_replay'\'');')"
enabled_flag_count="$(psql_scalar 'SELECT COUNT(*) FROM "EngageFeatureFlag" WHERE "workspaceId" = '\''engagews_default'\'' AND "enabled" = true;')"

test "$workspace_count" = "1"
test "$dashboard_user_count" = "$membership_count"
test "$dashboard_user_count" = "$active_membership_count"
test "$consistency_failures" = "0"
test "$reply_ready_count" = "$active_user_count"
test "$flag_count" = "3"
test "$enabled_flag_count" = "0"

install -d -m 700 "$BACKUP_DIR"
cp -a "$ENV_FILE" "$BACKUP_DIR/.env.before"
chmod 600 "$BACKUP_DIR/.env.before"
printf '%s\n' "$EXPECTED_LIVE_SHA" > "$BACKUP_DIR/live-source-before.sha"
cat "$LIVE_APP/.next/BUILD_ID" > "$BACKUP_DIR/build-before.id"
psql "$DATABASE_CLI_URL" -X -v ON_ERROR_STOP=1 -AtF'|' > "$BACKUP_DIR/flags-before.txt" <<'SQL'
SELECT "key", "enabled", "updatedAt"
FROM "EngageFeatureFlag"
WHERE "workspaceId" = 'engagews_default'
ORDER BY "key";
SQL
chmod 600 "$BACKUP_DIR/flags-before.txt" "$BACKUP_DIR/live-source-before.sha" "$BACKUP_DIR/build-before.id"
ROLLBACK_REQUIRED=1

write_env_value "$MASTER_KEY" true "$ENV_FILE"

psql "$DATABASE_CLI_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
BEGIN;
DO $$
DECLARE
  route_rows integer;
  total_rows integer;
BEGIN
  SELECT COUNT(*) INTO total_rows
  FROM "EngageFeatureFlag"
  WHERE "workspaceId" = 'engagews_default'
    AND "key" IN (
      'engageos.route_permissions',
      'engageos.outbound_policy',
      'engageos.webhook_replay'
    );
  IF total_rows <> 3 THEN
    RAISE EXCEPTION 'Expected exactly three EngageOS security feature flags.';
  END IF;

  UPDATE "EngageFeatureFlag"
  SET "enabled" = false, "updatedAt" = CURRENT_TIMESTAMP
  WHERE "workspaceId" = 'engagews_default'
    AND "key" IN ('engageos.outbound_policy', 'engageos.webhook_replay');

  UPDATE "EngageFeatureFlag"
  SET "enabled" = true, "updatedAt" = CURRENT_TIMESTAMP
  WHERE "workspaceId" = 'engagews_default'
    AND "key" = 'engageos.route_permissions';
  GET DIAGNOSTICS route_rows = ROW_COUNT;
  IF route_rows <> 1 THEN
    RAISE EXCEPTION 'Route-permissions feature flag row is missing or duplicated.';
  END IF;
END $$;
COMMIT;
SQL

ENGAGEOS_SECURITY_PERSISTENCE_ENABLED=true \
  pm2 restart "$PM2_PROCESS_NAME" --update-env >/dev/null
sleep 5

file_master_after="$(normalize_boolean "$(read_env_value "$MASTER_KEY" "$ENV_FILE")")"
pm2_master_after="$(normalize_boolean "$(pm2_field master)")"
route_enabled="$(psql_scalar 'SELECT COUNT(*) FROM "EngageFeatureFlag" WHERE "workspaceId" = '\''engagews_default'\'' AND "key" = '\''engageos.route_permissions'\'' AND "enabled" = true;')"
other_enabled="$(psql_scalar 'SELECT COUNT(*) FROM "EngageFeatureFlag" WHERE "workspaceId" = '\''engagews_default'\'' AND "key" IN ('\''engageos.outbound_policy'\'','\''engageos.webhook_replay'\'') AND "enabled" = true;')"
pm2_status="$(pm2_field status)"
login_http="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "${PUBLIC_URL%/}/login")"
inbox_http="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "${PUBLIC_URL%/}/inbox")"

test "$file_master_after" = "true"
test "$pm2_master_after" = "true"
test "$route_enabled" = "1"
test "$other_enabled" = "0"
test "$pm2_status" = "online"
test "$login_http" = "200"
test "$inbox_http" = "307"

{
  printf 'RUN_ID=%s\n' "$RUN_ID"
  printf 'EXPECTED_LIVE_SHA=%s\n' "$EXPECTED_LIVE_SHA"
  printf 'STATUS=PASS\n'
  printf 'SECURITY_MASTER=true\n'
  printf 'ROUTE_PERMISSIONS=true\n'
  printf 'OUTBOUND_POLICY=false\n'
  printf 'WEBHOOK_REPLAY=false\n'
  printf 'PM2_STATUS=%s\n' "$pm2_status"
  printf 'LOGIN_HTTP=%s\n' "$login_http"
  printf 'INBOX_HTTP=%s\n' "$inbox_http"
  printf 'COMPLETED_UTC=%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
} > "$RESULT_FILE"
chmod 600 "$RESULT_FILE"
ROLLBACK_REQUIRED=0
cat "$RESULT_FILE"
printf 'PASS: ROUTE_PERMISSIONS_ACTIVATION_COMPLETE\n'
