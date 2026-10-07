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

fail_safe_on_error() {
  local exit_code=$?
  trap - ERR
  printf 'FAIL: ROUTE_PERMISSIONS_DISABLE_FAILED code=%s\n' "$exit_code" >&2
  if [[ -n "${DATABASE_CLI_URL:-}" ]]; then
    psql "$DATABASE_CLI_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<'SQL' || true
UPDATE "EngageFeatureFlag"
SET "enabled" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE "workspaceId" = 'engagews_default'
  AND "key" = 'engageos.route_permissions';
SQL
  fi
  if [[ -f "$ENV_FILE" ]]; then
    write_env_value "$MASTER_KEY" false "$ENV_FILE" || true
  fi
  ENGAGEOS_SECURITY_PERSISTENCE_ENABLED=false \
    pm2 restart "$PM2_PROCESS_NAME" --update-env >/dev/null 2>&1 || true
  exit "$exit_code"
}
trap fail_safe_on_error ERR

[[ "$EXPECTED_LIVE_SHA" =~ ^[0-9a-f]{40}$ ]]
test -f "$ENV_FILE"
cd "$LIVE_APP"
test "$(git rev-parse HEAD)" = "$EXPECTED_LIVE_SHA"
test -z "$(git status --porcelain --untracked-files=no)"
prepare_database_url

install -d -m 700 "$BACKUP_DIR"
cp -a "$ENV_FILE" "$BACKUP_DIR/.env.before-disable"
chmod 600 "$BACKUP_DIR/.env.before-disable"
printf '%s\n' "$EXPECTED_LIVE_SHA" > "$BACKUP_DIR/live-source-before-disable.sha"
cat "$LIVE_APP/.next/BUILD_ID" > "$BACKUP_DIR/build-before-disable.id"
psql "$DATABASE_CLI_URL" -X -v ON_ERROR_STOP=1 -AtF'|' > "$BACKUP_DIR/flags-before-disable.txt" <<'SQL'
SELECT "key", "enabled", "updatedAt"
FROM "EngageFeatureFlag"
WHERE "workspaceId" = 'engagews_default'
ORDER BY "key";
SQL
chmod 600 "$BACKUP_DIR"/*

psql "$DATABASE_CLI_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
BEGIN;
DO $$
DECLARE
  route_rows integer;
BEGIN
  UPDATE "EngageFeatureFlag"
  SET "enabled" = false, "updatedAt" = CURRENT_TIMESTAMP
  WHERE "workspaceId" = 'engagews_default'
    AND "key" = 'engageos.route_permissions';
  GET DIAGNOSTICS route_rows = ROW_COUNT;
  IF route_rows <> 1 THEN
    RAISE EXCEPTION 'Route-permissions feature flag row is missing or duplicated.';
  END IF;
END $$;
COMMIT;
SQL

write_env_value "$MASTER_KEY" false "$ENV_FILE"
ENGAGEOS_SECURITY_PERSISTENCE_ENABLED=false \
  pm2 restart "$PM2_PROCESS_NAME" --update-env >/dev/null
sleep 5

file_master="$(normalize_boolean "$(read_env_value "$MASTER_KEY" "$ENV_FILE")")"
pm2_master="$(normalize_boolean "$(pm2_field master)")"
flag_count="$(psql_scalar 'SELECT COUNT(*) FROM "EngageFeatureFlag" WHERE "workspaceId" = '\''engagews_default'\'' AND "key" IN ('\''engageos.route_permissions'\'','\''engageos.outbound_policy'\'','\''engageos.webhook_replay'\'');')"
enabled_flag_count="$(psql_scalar 'SELECT COUNT(*) FROM "EngageFeatureFlag" WHERE "workspaceId" = '\''engagews_default'\'' AND "enabled" = true;')"
pm2_status="$(pm2_field status)"
login_http="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "${PUBLIC_URL%/}/login")"
inbox_http="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "${PUBLIC_URL%/}/inbox")"

test "$file_master" = "false"
test "$pm2_master" = "false"
test "$flag_count" = "3"
test "$enabled_flag_count" = "0"
test "$pm2_status" = "online"
test "$login_http" = "200"
test "$inbox_http" = "307"

{
  printf 'RUN_ID=%s\n' "$RUN_ID"
  printf 'EXPECTED_LIVE_SHA=%s\n' "$EXPECTED_LIVE_SHA"
  printf 'STATUS=PASS\n'
  printf 'SECURITY_MASTER=false\n'
  printf 'ROUTE_PERMISSIONS=false\n'
  printf 'OUTBOUND_POLICY=false\n'
  printf 'WEBHOOK_REPLAY=false\n'
  printf 'PM2_STATUS=%s\n' "$pm2_status"
  printf 'LOGIN_HTTP=%s\n' "$login_http"
  printf 'INBOX_HTTP=%s\n' "$inbox_http"
  printf 'COMPLETED_UTC=%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
} > "$RESULT_FILE"
chmod 600 "$RESULT_FILE"
cat "$RESULT_FILE"
printf 'PASS: ROUTE_PERMISSIONS_DISABLE_COMPLETE\n'
