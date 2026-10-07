#!/usr/bin/env bash
set -Eeuo pipefail

script_path="scripts/engageos-production-preflight.sh"
normalizer_path="scripts/prisma-postgres-cli-url.mjs"

test -f "$script_path"
test -f "$normalizer_path"
bash -n "$script_path"
node --check "$normalizer_path"

forbidden_patterns=(
  'prisma[[:space:]]+migrate[[:space:]]+deploy'
  'prisma[[:space:]]+migrate[[:space:]]+resolve'
  'pm2[[:space:]]+(restart|reload|stop|delete|kill)'
  'git[[:space:]]+(reset|checkout|switch|pull|merge|rebase|clean)'
  '(^|[[:space:]])(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)[[:space:]]'
  'source[[:space:]]+.*ENV_FILE'
  '(^|[[:space:]])\.[[:space:]]+.*ENV_FILE'
  '(^|[[:space:]])(cat|printf|echo)[[:space:]].*DATABASE_URL'
)

for pattern in "${forbidden_patterns[@]}"; do
  if grep -En "$pattern" "$script_path"; then
    printf 'Forbidden production-preflight pattern detected: %s\n' "$pattern" >&2
    exit 1
  fi
done

normalized_url="$(
  node "$normalizer_path" \
    'postgresql://ci_user:ci_password@localhost:5432/agent?schema=public&connection_limit=10&pool_timeout=15&pgbouncer=true&sslmode=require'
)"
expected_url='postgresql://ci_user:ci_password@localhost:5432/agent?sslmode=require'
test "$normalized_url" = "$expected_url"

prisma_validation_line="$(grep -nF 'npx prisma validate' "$script_path" | head -n1 | cut -d: -f1)"
database_export_line="$(grep -nF 'export DATABASE_URL' "$script_path" | head -n1 | cut -d: -f1)"
test -n "$prisma_validation_line"
test -n "$database_export_line"
test "$database_export_line" -lt "$prisma_validation_line"

grep -Fq 'DATABASE_CLI_URL' "$script_path"
grep -Fq 'psql "$DATABASE_CLI_URL"' "$script_path"
grep -Fq 'pg_dump --schema-only --no-owner --no-privileges "$DATABASE_CLI_URL"' "$script_path"
grep -Fq 'SELECT current_database()' "$script_path"
grep -Fq '20260723160037_init_whatsapp_agent' "$script_path"
grep -Fq '20260911150000_add_phase16a_saas_persistence' "$script_path"
grep -Fq 'LEGACY_INIT_APPLIED_COUNT=' "$script_path"
grep -Fq 'deployed legacy Prisma migration is applied exactly once' "$script_path"
grep -Fq 'recognized migration lineage' "$script_path"
grep -Fq 'find prisma/migrations' "$script_path"
grep -Fq 'comm -13' "$script_path"
grep -Fq 'COMMITTED_REPO_MIGRATION_COUNT=' "$script_path"
grep -Fq 'absent from the target release' "$script_path"
grep -Fq 'PREFLIGHT_STATUS=PASS' "$script_path"
grep -Fq 'PREFLIGHT_STATUS=FAIL' "$script_path"
grep -Fq 'EngageOS security master must be absent or false' "$script_path"
grep -Fq 'schema-only' "$script_path"

printf 'EngageOS production preflight policy test passed.\n'
