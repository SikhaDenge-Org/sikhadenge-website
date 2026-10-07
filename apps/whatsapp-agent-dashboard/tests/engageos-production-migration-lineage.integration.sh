#!/usr/bin/env bash
set -Eeuo pipefail

LIVE_SCHEMA_SHA="a17a92761bebc93eea76c7c443933b5a0c3443e3"
LINEAGE_DATABASE="sikhadenge_whatsapp_lineage"
ADMIN_DATABASE_URL="postgresql://ci_user:ci_password@localhost:5432/postgres"
LINEAGE_DATABASE_URL="postgresql://ci_user:ci_password@localhost:5432/${LINEAGE_DATABASE}?schema=public"
LINEAGE_CLI_URL="postgresql://ci_user:ci_password@localhost:5432/${LINEAGE_DATABASE}"
LEGACY_SCHEMA_FILE="$(mktemp /tmp/engageos-live-schema.XXXXXX.prisma)"
LINEAGE_ENV_FILE="$(mktemp /tmp/engageos-lineage-env.XXXXXX)"
LINEAGE_BACKUP_DIR="$(mktemp -d /tmp/engageos-lineage-evidence.XXXXXX)"

cleanup() {
  rm -f "$LEGACY_SCHEMA_FILE" "$LINEAGE_ENV_FILE"
  find "$LINEAGE_BACKUP_DIR" -depth -delete >/dev/null 2>&1 || true
  dropdb --if-exists --maintenance-db="$ADMIN_DATABASE_URL" "$LINEAGE_DATABASE" >/dev/null 2>&1 || true
}
trap cleanup EXIT

dropdb --if-exists --maintenance-db="$ADMIN_DATABASE_URL" "$LINEAGE_DATABASE" >/dev/null 2>&1 || true
createdb --maintenance-db="$ADMIN_DATABASE_URL" "$LINEAGE_DATABASE"

git show "${LIVE_SCHEMA_SHA}:apps/whatsapp-agent-dashboard/prisma/schema.prisma" > "$LEGACY_SCHEMA_FILE"
test -s "$LEGACY_SCHEMA_FILE"

export DATABASE_URL="$LINEAGE_DATABASE_URL"
npx prisma db push --schema "$LEGACY_SCHEMA_FILE" --skip-generate

DASHBOARD_ADMIN_NAME="Lineage Admin" \
DASHBOARD_ADMIN_EMAIL="lineage-admin@example.invalid" \
DASHBOARD_ADMIN_PASSWORD="CI-lineage-password-12345" \
npm run db:seed

psql "$LINEAGE_CLI_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE "_prisma_migrations" (
  "id" VARCHAR(36) NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
);

INSERT INTO "_prisma_migrations" (
  "id",
  "checksum",
  "finished_at",
  "migration_name",
  "applied_steps_count"
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00c113945db2e6ae000000000000000000000000000000000000000000000000',
  now(),
  '20260723160037_init_whatsapp_agent',
  1
);
SQL

cat > "$LINEAGE_ENV_FILE" <<EOF
DATABASE_URL=$LINEAGE_DATABASE_URL
ENGAGEOS_SECURITY_PERSISTENCE_ENABLED=false
EOF

LIVE_APP="$PWD" \
STAGE_APP="$PWD" \
BACKUP_DIR="$LINEAGE_BACKUP_DIR" \
ENV_FILE="$LINEAGE_ENV_FILE" \
bash scripts/engageos-production-migrate.sh

legacy_count="$(psql "$LINEAGE_CLI_URL" -X -Atqc "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20260723160037_init_whatsapp_agent' AND finished_at IS NOT NULL;")"
baseline_count="$(psql "$LINEAGE_CLI_URL" -X -Atqc "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20260802000000_baseline_existing_schema' AND finished_at IS NOT NULL;")"
additive_count="$(psql "$LINEAGE_CLI_URL" -X -Atqc "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20260802174500_add_engageos_security_persistence' AND finished_at IS NOT NULL;")"
phase16a_count="$(psql "$LINEAGE_CLI_URL" -X -Atqc "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20260911150000_add_phase16a_saas_persistence' AND finished_at IS NOT NULL;")"
workspace_count="$(psql "$LINEAGE_CLI_URL" -X -Atqc 'SELECT COUNT(*) FROM "EngageWorkspace";')"
flag_enabled_count="$(psql "$LINEAGE_CLI_URL" -X -Atqc 'SELECT COUNT(*) FROM "EngageFeatureFlag" WHERE enabled = true;')"

test "$legacy_count" = "1"
test "$baseline_count" = "1"
test "$additive_count" = "1"
test "$phase16a_count" = "1"
test "$workspace_count" = "1"

for table_name in   EngageAgencyWorkspaceLink   EngageWorkspaceSaasState   EngagePublicApiKey   EngageWorkspaceUsageEvent   EngageWhiteLabelConfig   EngageCustomDomain   EngageDeveloperRequestLog; do

  table_exists="$(
    psql "$LINEAGE_CLI_URL"       -X       -Atqc       "SELECT CASE WHEN to_regclass('public.\"${table_name}\"') IS NULL THEN '0' ELSE '1' END;"
  )"

  test "$table_exists" = "1"
done
test "$flag_enabled_count" = "0"

test -s "$LINEAGE_BACKUP_DIR/migration-evidence.txt"
printf 'Production-like Prisma lineage integration test passed.\n'
