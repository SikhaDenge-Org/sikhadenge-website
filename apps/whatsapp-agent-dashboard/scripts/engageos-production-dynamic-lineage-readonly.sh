#!/usr/bin/env bash
set -Eeuo pipefail

: "${STAGE_APP:?STAGE_APP is required}"
: "${ENV_FILE:?ENV_FILE is required}"

LEGACY_INIT="20260723160037_init_whatsapp_agent"

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
test -d "$STAGE_APP/prisma/migrations"
DATABASE_URL="$(read_env_value DATABASE_URL "$ENV_FILE")"
DATABASE_CLI_URL="$(node "$STAGE_APP/scripts/prisma-postgres-cli-url.mjs" "$DATABASE_URL")"

failed_count="$(psql_scalar 'SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL;')"
legacy_count="$(psql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '${LEGACY_INIT}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
test "$failed_count" = "0"
test "$legacy_count" = "1"

repo_migrations="$(find "$STAGE_APP/prisma/migrations" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)"
applied_migrations="$(psql_scalar 'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name;')"
recognized="$(printf '%s\n%s\n' "$LEGACY_INIT" "$repo_migrations" | sed '/^$/d' | sort -u)"
unknown="$(comm -13 <(printf '%s\n' "$recognized") <(printf '%s\n' "$applied_migrations") || true)"
pending="$(comm -23 <(printf '%s\n' "$repo_migrations") <(printf '%s\n' "$applied_migrations") || true)"
unknown_count="$(printf '%s\n' "$unknown" | sed '/^$/d' | wc -l | tr -d ' ')"
pending_count="$(printf '%s\n' "$pending" | sed '/^$/d' | wc -l | tr -d ' ')"

printf 'DYNAMIC_LINEAGE_FAILED_COUNT=%s\n' "$failed_count"
printf 'DYNAMIC_LINEAGE_LEGACY_COUNT=%s\n' "$legacy_count"
printf 'DYNAMIC_LINEAGE_UNKNOWN_APPLIED_COUNT=%s\n' "$unknown_count"
printf 'DYNAMIC_LINEAGE_PENDING_REPO_COUNT=%s\n' "$pending_count"

if [[ "$unknown_count" != "0" ]]; then
  printf 'FAIL: applied migrations absent from target release repository\n' >&2
  printf '%s\n' "$unknown" >&2
  exit 1
fi

# Pending committed migrations are expected before Task 2 and are intentionally read-only here.
printf 'PASS: DYNAMIC_READONLY_MIGRATION_LINEAGE_VERIFIED\n'
