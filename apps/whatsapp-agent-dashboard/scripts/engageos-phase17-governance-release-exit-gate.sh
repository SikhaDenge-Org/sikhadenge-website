#!/usr/bin/env bash
set -Eeuo pipefail

: "${LIVE_APP:?LIVE_APP is required}"
: "${STAGE_APP:?STAGE_APP is required}"
: "${RELEASE_SHA:?RELEASE_SHA is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required}"

ENV_FILE="${ENV_FILE:-${LIVE_APP}/.env}"
WORKSPACE_ID="${PHASE17_WORKSPACE_ID:-engagews_default}"

MIGRATIONS=(
  20260913113000_add_phase17_controlled_launch_state
  20260916173000_add_phase17_outbound_approval_engine
  20260916190000_add_phase17_g3_bounded_autopilot_recipient_ledger
  20260916210000_add_phase17_g4_approved_flow_registry
  20260916223000_add_phase17_g5_approved_flow_revocation_audit
)

read_env_value() {
  local key="$1" file="$2"
  node - "$file" "$key" <<'NODE'
const fs = require('node:fs');
const [file, key] = process.argv.slice(2);
if (!file || !key || !fs.existsSync(file)) process.exit(1);
for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
  let line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  if (line.startsWith('export ')) line = line.slice(7).trim();
  const i = line.indexOf('=');
  if (i < 1 || line.slice(0, i).trim() !== key) continue;
  let value = line.slice(i + 1).trim();
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

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

[[ "$WORKSPACE_ID" == "engagews_default" ]] || fail "unexpected workspace"
[[ "$(git -C "$LIVE_APP" rev-parse HEAD)" == "$RELEASE_SHA" ]] || fail "live source SHA mismatch"
[[ "$(git -C "$STAGE_APP" rev-parse HEAD)" == "$RELEASE_SHA" ]] || fail "staging source SHA mismatch"
[[ -z "$(git -C "$LIVE_APP" status --porcelain --untracked-files=no)" ]] || fail "live tracked worktree is dirty"
[[ -f "$ENV_FILE" ]] || fail "environment file missing"

DATABASE_URL="$(read_env_value DATABASE_URL "$ENV_FILE")"
DATABASE_CLI_URL="$(node "$STAGE_APP/scripts/prisma-postgres-cli-url.mjs" "$DATABASE_URL")"
export DATABASE_URL

for migration_name in "${MIGRATIONS[@]}"; do
  [[ -d "$STAGE_APP/prisma/migrations/$migration_name" ]] || fail "release migration missing from repository: $migration_name"
  migration_count="$(psql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name='${migration_name}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
  [[ "$migration_count" == "1" ]] || fail "governance migration is not applied exactly once: ${migration_name} count=${migration_count}"
done

required_tables=(
  EngageControlledLaunchState
  EngageControlledLaunchTransition
  EngageControlledLaunchOutboundApproval
  EngageControlledLaunchAutopilotRecipient
  EngageControlledLaunchApprovedFlow
)
for table_name in "${required_tables[@]}"; do
  exists="$(psql_scalar "SELECT CASE WHEN to_regclass('public.\"${table_name}\"') IS NULL THEN '0' ELSE '1' END;")"
  [[ "$exists" == "1" ]] || fail "required governance table missing: $table_name"
done
revocation_columns="$(psql_scalar "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='EngageControlledLaunchApprovedFlow' AND column_name IN ('revokedByUserId','revokeReason');")"
[[ "$revocation_columns" == "2" ]] || fail "approved-flow revocation audit columns are incomplete"

autopilot_unique="$(psql_scalar "SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public' AND tablename='EngageControlledLaunchAutopilotRecipient' AND indexname='EngageControlledLaunchAutopilotRecipient_scope_recipient_key';")"
[[ "$autopilot_unique" == "1" ]] || fail "bounded-autopilot distinct-recipient unique index missing"

approved_flow_unique="$(psql_scalar "SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public' AND tablename='EngageControlledLaunchApprovedFlow' AND indexname='EngageControlledLaunchApprovedFlow_active_unique';")"
[[ "$approved_flow_unique" == "1" ]] || fail "approved-flow active authority unique index missing"

state_count="$(psql_scalar "SELECT COUNT(*) FROM \"EngageControlledLaunchState\" WHERE \"workspaceId\"='${WORKSPACE_ID}';")"
[[ "$state_count" == "1" ]] || fail "expected exactly one controlled-launch state for release workspace"

unsafe_shadow="$(psql_scalar "SELECT COUNT(*) FROM \"EngageControlledLaunchState\" WHERE \"workspaceId\"='${WORKSPACE_ID}' AND \"mode\"='SHADOW' AND (\"writePolicy\" <> 'NO_EXTERNAL_WRITES' OR \"externalWritesAllowed\"=true OR COALESCE(\"scope\"->>'externalWritesRequested','false') <> 'false');")"
[[ "$unsafe_shadow" == "0" ]] || fail "SHADOW controlled-launch state permits or requests external writes"

{
  printf 'RELEASE_SHA=%s\n' "$RELEASE_SHA"
  printf 'WORKSPACE_ID=%s\n' "$WORKSPACE_ID"
  printf 'GOVERNANCE_MIGRATION_COUNT=%s\n' "${#MIGRATIONS[@]}"
  printf 'REQUIRED_GOVERNANCE_TABLE_COUNT=%s\n' "${#required_tables[@]}"
  printf 'APPROVED_FLOW_REVOCATION_COLUMNS=%s\n' "$revocation_columns"
  printf 'AUTOPILOT_DISTINCT_RECIPIENT_INDEX=%s\n' "$autopilot_unique"
  printf 'APPROVED_FLOW_ACTIVE_UNIQUE_INDEX=%s\n' "$approved_flow_unique"
  printf 'UNSAFE_SHADOW_STATE_COUNT=%s\n' "$unsafe_shadow"
  printf 'VERIFIED_UTC=%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
} > "$BACKUP_DIR/phase17-governance-release-exit-evidence.txt"
chmod 600 "$BACKUP_DIR/phase17-governance-release-exit-evidence.txt"
cat "$BACKUP_DIR/phase17-governance-release-exit-evidence.txt"
printf 'PASS: PHASE17_GOVERNANCE_RELEASE_EXIT_GATE\n'
