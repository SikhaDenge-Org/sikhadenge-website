#!/usr/bin/env bash
set -Eeuo pipefail

: "${LIVE_APP:?LIVE_APP is required}"
: "${STAGE_APP:?STAGE_APP is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required}"

ENV_FILE="${ENV_FILE:-${LIVE_APP}/.env}"
LEGACY_INIT="20260723160037_init_whatsapp_agent"
BASELINE="20260802000000_baseline_existing_schema"
PHASE17="20260913113000_add_phase17_controlled_launch_state"

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

test "$(psql_scalar 'SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL;')" = "0"
test "$(psql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '${LEGACY_INIT}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")" = "1"

repo_migrations="$(find prisma/migrations -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)"
test -n "$repo_migrations"
applied_before="$(psql_scalar 'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name;')"
recognized_before="$(printf '%s\n%s\n' "$LEGACY_INIT" "$repo_migrations" | sed '/^$/d' | sort -u)"
unknown_before="$(comm -13 <(printf '%s\n' "$recognized_before") <(printf '%s\n' "$applied_before") || true)"
if [[ -n "$(printf '%s\n' "$unknown_before" | sed '/^$/d')" ]]; then
  printf 'FAIL: production migration lineage contains migrations absent from release repository\n' >&2
  printf '%s\n' "$unknown_before" >&2
  exit 1
fi

baseline_count="$(psql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '${BASELINE}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
if [[ "$baseline_count" == "0" ]]; then
  repo_applied_without_baseline="$(psql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name <> '${LEGACY_INIT}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
  test "$repo_applied_without_baseline" = "0"
  npx prisma migrate resolve --applied "$BASELINE"
  printf 'PASS: ONE_TIME_BASELINE_RECORDED\n'
elif [[ "$baseline_count" == "1" ]]; then
  printf 'PASS: ONE_TIME_BASELINE_ALREADY_RECORDED\n'
else
  printf 'FAIL: baseline migration is duplicated\n' >&2
  exit 1
fi

printf 'COMMITTED_MIGRATION_COUNT=%s\n' "$(printf '%s\n' "$repo_migrations" | sed '/^$/d' | wc -l | tr -d ' ')"
npx prisma migrate deploy
npx prisma migrate status

failed_after="$(psql_scalar 'SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL;')"
test "$failed_after" = "0"

missing_after=0
duplicated_after=0
while IFS= read -r migration_name; do
  [[ -n "$migration_name" ]] || continue
  count="$(psql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '${migration_name}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
  if [[ "$count" == "0" ]]; then
    printf 'FAIL: committed migration not applied: %s\n' "$migration_name" >&2
    missing_after=$((missing_after + 1))
  elif [[ "$count" != "1" ]]; then
    printf 'FAIL: committed migration applied non-exactly-once: %s count=%s\n' "$migration_name" "$count" >&2
    duplicated_after=$((duplicated_after + 1))
  fi
done <<<"$repo_migrations"
test "$missing_after" = "0"
test "$duplicated_after" = "0"

applied_after="$(psql_scalar 'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name;')"
recognized_after="$(printf '%s\n%s\n' "$LEGACY_INIT" "$repo_migrations" | sed '/^$/d' | sort -u)"
unknown_after="$(comm -13 <(printf '%s\n' "$recognized_after") <(printf '%s\n' "$applied_after") || true)"
test -z "$(printf '%s\n' "$unknown_after" | sed '/^$/d')"

phase17_count="$(psql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '${PHASE17}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
test "$phase17_count" = "1"

workspace_count="$(psql_scalar 'SELECT COUNT(*) FROM "EngageWorkspace" WHERE "id" = '\''engagews_default'\'' AND "isActive" = true;')"
user_count="$(psql_scalar 'SELECT COUNT(*) FROM "DashboardUser";')"
membership_count="$(psql_scalar 'SELECT COUNT(*) FROM "EngageWorkspaceMembership" WHERE "workspaceId" = '\''engagews_default'\'';')"
flag_count="$(psql_scalar "SELECT COUNT(*) FROM \"EngageFeatureFlag\" WHERE \"workspaceId\" = 'engagews_default' AND key IN ('engageos.route_permissions','engageos.outbound_policy','engageos.webhook_replay');")"
enabled_flag_count="$(psql_scalar "SELECT COUNT(*) FROM \"EngageFeatureFlag\" WHERE \"workspaceId\" = 'engagews_default' AND enabled = true;")"
test "$workspace_count" = "1"
test "$membership_count" = "$user_count"
test "$flag_count" = "3"
test "$enabled_flag_count" = "0"

required_tables=(
  EngageAgencyWorkspaceLink EngageWorkspaceSaasState EngagePublicApiKey EngageWorkspaceUsageEvent
  EngageWhiteLabelConfig EngageCustomDomain EngageDeveloperRequestLog EngageOutboundWebhookEndpoint
  EngageControlledLaunchState EngageControlledLaunchTransition
  EngageControlledLaunchOutboundApproval EngageControlledLaunchAutopilotRecipient EngageControlledLaunchApprovedFlow
)
for table_name in "${required_tables[@]}"; do
  test "$(psql_scalar "SELECT CASE WHEN to_regclass('public.\"${table_name}\"') IS NULL THEN '0' ELSE '1' END;")" = "1"
done

{
  printf 'LEGACY_INIT=%s\n' "$LEGACY_INIT"
  printf 'PHASE17=%s\n' "$PHASE17"
  printf 'PHASE17_COUNT=%s\n' "$phase17_count"
  printf 'MISSING_COMMITTED_MIGRATIONS=%s\n' "$missing_after"
  printf 'DUPLICATED_COMMITTED_MIGRATIONS=%s\n' "$duplicated_after"
  printf 'DASHBOARD_USER_COUNT=%s\n' "$user_count"
  printf 'DEFAULT_MEMBERSHIP_COUNT=%s\n' "$membership_count"
  printf 'FEATURE_FLAGS_ENABLED=%s\n' "$enabled_flag_count"
  printf 'VERIFIED_UTC=%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
} > "$BACKUP_DIR/migration-evidence.txt"
chmod 600 "$BACKUP_DIR/migration-evidence.txt"
cat "$BACKUP_DIR/migration-evidence.txt"
printf 'PASS: ENGAGEOS_DYNAMIC_MIGRATION_VERIFIED_FLAGS_OFF\n'
