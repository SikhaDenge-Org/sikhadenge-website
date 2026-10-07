#!/usr/bin/env bash
set -Eeuo pipefail

: "${STAGE_APP:?STAGE_APP is required}"
: "${ENV_FILE:?ENV_FILE is required}"

BACKUP_DIR="${BACKUP_DIR:-}"
WRITE_EVIDENCE="${WRITE_EVIDENCE:-0}"

LEGACY_INIT="20260723160037_init_whatsapp_agent"
BASELINE="20260802000000_baseline_existing_schema"
ADDITIVE="20260802174500_add_engageos_security_persistence"
PHASE16A="20260911150000_add_phase16a_saas_persistence"
PHASE16E="20260912194000_add_phase16e_enterprise_webhooks"

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
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
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
test -f "$STAGE_APP/prisma/migrations/$PHASE16E/migration.sql"
DATABASE_URL="$(read_env_value DATABASE_URL "$ENV_FILE")"
DATABASE_CLI_URL="$(node "$STAGE_APP/scripts/prisma-postgres-cli-url.mjs" "$DATABASE_URL")"

failed_count="$(psql_scalar 'SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL;')"
legacy_count="$(psql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '${LEGACY_INIT}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
baseline_count="$(psql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '${BASELINE}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
additive_count="$(psql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '${ADDITIVE}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
phase16a_count="$(psql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '${PHASE16A}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
phase16e_count="$(psql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '${PHASE16E}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
unknown_count="$(psql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name NOT IN ('${LEGACY_INIT}','${BASELINE}','${ADDITIVE}','${PHASE16A}','${PHASE16E}');")"
phase16e_table="$(psql_scalar "SELECT CASE WHEN to_regclass('public.\"EngageOutboundWebhookEndpoint\"') IS NULL THEN '0' ELSE '1' END;")"

printf 'PHASE16E_LINEAGE_FAILED_COUNT=%s\n' "$failed_count"
printf 'PHASE16E_LINEAGE_LEGACY_COUNT=%s\n' "$legacy_count"
printf 'PHASE16E_LINEAGE_BASELINE_COUNT=%s\n' "$baseline_count"
printf 'PHASE16E_LINEAGE_ADDITIVE_COUNT=%s\n' "$additive_count"
printf 'PHASE16E_LINEAGE_PHASE16A_COUNT=%s\n' "$phase16a_count"
printf 'PHASE16E_LINEAGE_PHASE16E_COUNT=%s\n' "$phase16e_count"
printf 'PHASE16E_LINEAGE_UNKNOWN_COUNT=%s\n' "$unknown_count"
printf 'PHASE16E_WEBHOOK_TABLE_EXISTS=%s\n' "$phase16e_table"

test "$failed_count" = "0"
test "$legacy_count" = "1"
test "$baseline_count" = "1"
test "$additive_count" = "1"
test "$phase16a_count" = "1"
test "$phase16e_count" = "1"
test "$unknown_count" = "0"
test "$phase16e_table" = "1"

if [[ "$WRITE_EVIDENCE" == "1" ]]; then
  : "${BACKUP_DIR:?BACKUP_DIR is required when WRITE_EVIDENCE=1}"
  install -d -m 700 "$BACKUP_DIR"
  cat > "$BACKUP_DIR/migration-evidence.txt" <<EOF
LEGACY_INIT=$LEGACY_INIT
BASELINE=$BASELINE
ADDITIVE=$ADDITIVE
PHASE16A=$PHASE16A
PHASE16E=$PHASE16E
LEGACY_INIT_COUNT=$legacy_count
BASELINE_COUNT=$baseline_count
ADDITIVE_COUNT=$additive_count
PHASE16A_COUNT=$phase16a_count
PHASE16E_COUNT=$phase16e_count
UNKNOWN_MIGRATION_COUNT=$unknown_count
PHASE16E_WEBHOOK_TABLE_EXISTS=$phase16e_table
MIGRATION_ACTION=NONE_ALREADY_APPLIED
VERIFIED_UTC=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
EOF
  chmod 600 "$BACKUP_DIR/migration-evidence.txt"
fi

printf 'PASS: PHASE16E_RECOGNIZED_MIGRATION_LINEAGE\n'
