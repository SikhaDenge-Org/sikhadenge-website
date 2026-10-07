#!/usr/bin/env bash
set -Eeuo pipefail

: "${LIVE_APP:?LIVE_APP is required}"
: "${STAGE_APP:?STAGE_APP is required}"
: "${RELEASE_SHA:?RELEASE_SHA is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required}"

ENV_FILE="${ENV_FILE:-${LIVE_APP}/.env}"
WORKSPACE_ID="engagews_default"
PHASE17="20260913113000_add_phase17_controlled_launch_state"
PUBLIC_URL="${PUBLIC_URL:-https://whatsapp.sikhadenge.in}"

read_env_value() {
  local key="$1" file="$2"
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
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) value = value.slice(1, -1);
  process.stdout.write(value);
  process.exit(0);
}
process.exit(1);
NODE
}

psql_scalar() {
  psql "$DATABASE_CLI_URL" -X -v ON_ERROR_STOP=1 -Atqc "$1"
}

test "$(git -C "$LIVE_APP" rev-parse HEAD)" = "$RELEASE_SHA"
test -f "$ENV_FILE"
DATABASE_URL="$(read_env_value DATABASE_URL "$ENV_FILE")"
DATABASE_CLI_URL="$(node "$STAGE_APP/scripts/prisma-postgres-cli-url.mjs" "$DATABASE_URL")"

phase17_count="$(psql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '${PHASE17}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
state_table="$(psql_scalar "SELECT CASE WHEN to_regclass('public.\"EngageControlledLaunchState\"') IS NULL THEN '0' ELSE '1' END;")"
transition_table="$(psql_scalar "SELECT CASE WHEN to_regclass('public.\"EngageControlledLaunchTransition\"') IS NULL THEN '0' ELSE '1' END;")"
test "$phase17_count" = "1"
test "$state_table" = "1"
test "$transition_table" = "1"

state_count="$(psql_scalar "SELECT COUNT(*) FROM \"EngageControlledLaunchState\" WHERE \"workspaceId\" = '${WORKSPACE_ID}';")"
test "$state_count" = "1"
state_tuple="$(psql_scalar "SELECT \"stage\" || '|' || \"mode\" || '|' || \"writePolicy\" || '|' || CASE WHEN \"externalWritesAllowed\" THEN 'true' ELSE 'false' END || '|' || \"version\"::text || '|' || COALESCE(\"scope\"->>'maxRealLeads','') || '|' || COALESCE(\"scope\"->>'externalWritesRequested','') FROM \"EngageControlledLaunchState\" WHERE \"workspaceId\" = '${WORKSPACE_ID}';")"
test "$state_tuple" = "INTERNAL_TEST_IDENTITIES|SHADOW|NO_EXTERNAL_WRITES|false|1|0|false"

transition_count="$(psql_scalar "SELECT COUNT(*) FROM \"EngageControlledLaunchTransition\" WHERE \"workspaceId\" = '${WORKSPACE_ID}';")"
test "$transition_count" = "1"
transition_tuple="$(psql_scalar "SELECT COALESCE(\"fromStage\",'<null>') || '|' || \"toStage\" || '|' || COALESCE(\"fromMode\",'<null>') || '|' || \"toMode\" || '|' || COALESCE(\"fromWritePolicy\",'<null>') || '|' || \"toWritePolicy\" || '|' || CASE WHEN \"fromExternalWritesAllowed\" IS NULL THEN '<null>' WHEN \"fromExternalWritesAllowed\" THEN 'true' ELSE 'false' END || '|' || CASE WHEN \"toExternalWritesAllowed\" THEN 'true' ELSE 'false' END || '|' || COALESCE(\"expectedVersion\"::text,'<null>') || '|' || \"resultingVersion\"::text FROM \"EngageControlledLaunchTransition\" WHERE \"workspaceId\" = '${WORKSPACE_ID}';")"
test "$transition_tuple" = "<null>|INTERNAL_TEST_IDENTITIES|<null>|SHADOW|<null>|NO_EXTERNAL_WRITES|<null>|false|<null>|1"

flag_count="$(psql_scalar "SELECT COUNT(*) FROM \"EngageFeatureFlag\" WHERE \"workspaceId\" = '${WORKSPACE_ID}' AND key IN ('engageos.route_permissions','engageos.outbound_policy','engageos.webhook_replay');")"
enabled_flag_count="$(psql_scalar "SELECT COUNT(*) FROM \"EngageFeatureFlag\" WHERE \"workspaceId\" = '${WORKSPACE_ID}' AND enabled = true;")"
test "$flag_count" = "3"
test "$enabled_flag_count" = "0"

login_status="$(curl -L -sS -o /dev/null -w '%{http_code}' --max-time 20 "${PUBLIC_URL%/}/login" || true)"
test "$login_status" = "200"

{
  printf 'RELEASE_SHA=%s\n' "$RELEASE_SHA"
  printf 'WORKSPACE_ID=%s\n' "$WORKSPACE_ID"
  printf 'PHASE17_MIGRATION_COUNT=%s\n' "$phase17_count"
  printf 'STATE=%s\n' "$state_tuple"
  printf 'TRANSITION_COUNT=%s\n' "$transition_count"
  printf 'TRANSITION=%s\n' "$transition_tuple"
  printf 'FEATURE_FLAGS_ENABLED=%s\n' "$enabled_flag_count"
  printf 'LOGIN_HTTP=%s\n' "$login_status"
  printf 'VERIFIED_UTC=%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
} > "$BACKUP_DIR/phase17-stage1-evidence.txt"
chmod 600 "$BACKUP_DIR/phase17-stage1-evidence.txt"
cat "$BACKUP_DIR/phase17-stage1-evidence.txt"
printf 'PHASE17_STAGE1_PERSISTENCE=PASS\n'
printf 'PASS: PHASE17_STAGE1_PRODUCTION_STATE_VERIFIED\n'
