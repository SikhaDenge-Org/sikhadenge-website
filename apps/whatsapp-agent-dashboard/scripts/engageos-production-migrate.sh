#!/usr/bin/env bash
set -Eeuo pipefail

: "${LIVE_APP:?LIVE_APP is required}"
: "${STAGE_APP:?STAGE_APP is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required}"

ENV_FILE="${ENV_FILE:-${LIVE_APP}/.env}"
LEGACY_INIT="20260723160037_init_whatsapp_agent"
BASELINE="20260802000000_baseline_existing_schema"
ADDITIVE="20260802174500_add_engageos_security_persistence"
PHASE16A="20260911150000_add_phase16a_saas_persistence"

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

test -f "$ENV_FILE"
DATABASE_URL="$(read_env_value DATABASE_URL "$ENV_FILE")"
export DATABASE_URL
DATABASE_CLI_URL="$(node "$STAGE_APP/scripts/prisma-postgres-cli-url.mjs" "$DATABASE_URL")"

master_switch="$(read_env_value ENGAGEOS_SECURITY_PERSISTENCE_ENABLED "$ENV_FILE" 2>/dev/null || true)"
normalized_master="$(printf '%s' "$master_switch" | tr '[:upper:]' '[:lower:]' | xargs)"
if [[ -n "$normalized_master" && "$normalized_master" != "false" && "$normalized_master" != "0" ]]; then
  printf 'FAIL: ENGAGEOS_SECURITY_PERSISTENCE_ENABLED must remain absent or false\n' >&2
  exit 1
fi

cd "$STAGE_APP"
npx prisma validate

failed_count="$(psql_scalar 'SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL;')"
legacy_count="$(psql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '${LEGACY_INIT}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
baseline_count="$(psql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '${BASELINE}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
additive_count="$(psql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '${ADDITIVE}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
phase16a_count="$(psql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '${PHASE16A}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
unknown_count="$(psql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name NOT IN ('${LEGACY_INIT}','${BASELINE}','${ADDITIVE}','${PHASE16A}');")"

printf 'MIGRATION_FAILED_COUNT_BEFORE=%s\n' "$failed_count"
printf 'LEGACY_INIT_COUNT_BEFORE=%s\n' "$legacy_count"
printf 'BASELINE_COUNT_BEFORE=%s\n' "$baseline_count"
printf 'ADDITIVE_COUNT_BEFORE=%s\n' "$additive_count"
printf 'PHASE16A_COUNT_BEFORE=%s\n' "$phase16a_count"
printf 'UNKNOWN_COUNT_BEFORE=%s\n' "$unknown_count"

test "$failed_count" = "0"
test "$legacy_count" = "1"
test "$unknown_count" = "0"
test "$baseline_count" = "0" -o "$baseline_count" = "1"
test "$additive_count" = "0" -o "$additive_count" = "1"
test "$phase16a_count" = "0" -o "$phase16a_count" = "1"

if [[ "$phase16a_count" == "1" && "$additive_count" != "1" ]]; then
  printf 'FAIL: Phase 16A migration exists without additive security migration\n' >&2
  exit 1
fi

if [[ "$additive_count" == "1" && "$baseline_count" != "1" ]]; then
  printf 'FAIL: additive migration exists without baseline\n' >&2
  exit 1
fi

if [[ "$baseline_count" == "0" ]]; then
  test "$additive_count" = "0"
  test "$phase16a_count" = "0"
  npx prisma migrate resolve --applied "$BASELINE"
  printf 'PASS: ONE_TIME_BASELINE_RECORDED\n'
else
  printf 'PASS: ONE_TIME_BASELINE_ALREADY_RECORDED\n'
fi

if [[ "$additive_count" == "0" || "$phase16a_count" == "0" ]]; then
  npx prisma migrate deploy

  if [[ "$additive_count" == "0" ]]; then
    printf 'PASS: ADDITIVE_SECURITY_MIGRATION_DEPLOYED\n'
  else
    printf 'PASS: ADDITIVE_SECURITY_MIGRATION_ALREADY_DEPLOYED\n'
  fi

  if [[ "$phase16a_count" == "0" ]]; then
    printf 'PASS: PHASE16A_MIGRATION_DEPLOYED\n'
  else
    printf 'PASS: PHASE16A_MIGRATION_ALREADY_DEPLOYED\n'
  fi
else
  printf 'PASS: ADDITIVE_SECURITY_MIGRATION_ALREADY_DEPLOYED\n'
  printf 'PASS: PHASE16A_MIGRATION_ALREADY_DEPLOYED\n'
fi

npx prisma migrate status

failed_after="$(psql_scalar 'SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL;')"
baseline_after="$(psql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '${BASELINE}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
additive_after="$(psql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '${ADDITIVE}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
phase16a_after="$(psql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '${PHASE16A}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
workspace_count="$(psql_scalar 'SELECT COUNT(*) FROM "EngageWorkspace" WHERE "id" = '\''engagews_default'\'';')"
user_count="$(psql_scalar 'SELECT COUNT(*) FROM "DashboardUser";')"
membership_count="$(psql_scalar 'SELECT COUNT(*) FROM "EngageWorkspaceMembership" WHERE "workspaceId" = '\''engagews_default'\'';')"
flag_count="$(psql_scalar "SELECT COUNT(*) FROM \"EngageFeatureFlag\" WHERE \"workspaceId\" = 'engagews_default' AND key IN ('engageos.route_permissions','engageos.outbound_policy','engageos.webhook_replay');")"
enabled_flag_count="$(psql_scalar "SELECT COUNT(*) FROM \"EngageFeatureFlag\" WHERE \"workspaceId\" = 'engagews_default' AND enabled = true;")"

printf 'MIGRATION_FAILED_COUNT_AFTER=%s\n' "$failed_after"
printf 'BASELINE_COUNT_AFTER=%s\n' "$baseline_after"
printf 'ADDITIVE_COUNT_AFTER=%s\n' "$additive_after"
printf 'PHASE16A_COUNT_AFTER=%s\n' "$phase16a_after"
printf 'DEFAULT_WORKSPACE_COUNT=%s\n' "$workspace_count"
printf 'DASHBOARD_USER_COUNT=%s\n' "$user_count"
printf 'DEFAULT_MEMBERSHIP_COUNT=%s\n' "$membership_count"
printf 'FEATURE_FLAG_COUNT=%s\n' "$flag_count"
printf 'ENABLED_FEATURE_FLAG_COUNT=%s\n' "$enabled_flag_count"

test "$failed_after" = "0"
test "$baseline_after" = "1"
test "$additive_after" = "1"
test "$phase16a_after" = "1"
test "$workspace_count" = "1"
test "$membership_count" = "$user_count"

for phase16a_table in   EngageAgencyWorkspaceLink   EngageWorkspaceSaasState   EngagePublicApiKey   EngageWorkspaceUsageEvent   EngageWhiteLabelConfig   EngageCustomDomain   EngageDeveloperRequestLog; do

  phase16a_exists="$(psql_scalar "SELECT CASE WHEN to_regclass('public.\"${phase16a_table}\"') IS NULL THEN '0' ELSE '1' END;")"
  test "$phase16a_exists" = "1"
done
test "$flag_count" = "3"
test "$enabled_flag_count" = "0"

{
  printf 'LEGACY_INIT=%s\n' "$LEGACY_INIT"
  printf 'BASELINE=%s\n' "$BASELINE"
  printf 'ADDITIVE=%s\n' "$ADDITIVE"
  printf 'PHASE16A=%s\n' "$PHASE16A"
  printf 'PHASE16A_COUNT=%s\n' "$phase16a_after"
  printf 'DASHBOARD_USER_COUNT=%s\n' "$user_count"
  printf 'DEFAULT_MEMBERSHIP_COUNT=%s\n' "$membership_count"
  printf 'FEATURE_FLAGS_ENABLED=%s\n' "$enabled_flag_count"
  printf 'VERIFIED_UTC=%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
} > "$BACKUP_DIR/migration-evidence.txt"
chmod 600 "$BACKUP_DIR/migration-evidence.txt"
printf 'PASS: ENGAGEOS_MIGRATION_VERIFIED_FLAGS_OFF\n'
