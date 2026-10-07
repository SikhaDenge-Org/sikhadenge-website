#!/usr/bin/env bash
set -Eeuo pipefail

EXPECTED_RELEASE_SHA="${EXPECTED_RELEASE_SHA:-}"
ENV_FILE="${ENV_FILE:-.env}"
PM2_PROCESS_NAME="${PM2_PROCESS_NAME:-sikhadenge-whatsapp-agent}"
CHECK_HTTP_URL="${CHECK_HTTP_URL:-https://whatsapp.sikhadenge.in}"
LEGACY_INIT_MIGRATION="20260723160037_init_whatsapp_agent"

failures=0
warnings=0

pass() { printf 'PASS: %s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*"; warnings=$((warnings + 1)); }
fail() { printf 'FAIL: %s\n' "$*"; failures=$((failures + 1)); }

require_command() {
  if command -v "$1" >/dev/null 2>&1; then
    pass "command available: $1"
  else
    fail "required command missing: $1"
  fi
}

read_env_value() {
  local key="$1"
  local file="$2"
  node - "$file" "$key" <<'NODE'
const fs = require('node:fs');
const [file, key] = process.argv.slice(2);
if (!file || !key || !fs.existsSync(file)) process.exit(0);
const text = fs.readFileSync(file, 'utf8');
let value = '';
for (const rawLine of text.split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
  const separator = normalized.indexOf('=');
  if (separator < 1) continue;
  if (normalized.slice(0, separator).trim() !== key) continue;
  value = normalized.slice(separator + 1).trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1);
  }
}
process.stdout.write(value);
NODE
}

psql_scalar() {
  psql "$DATABASE_CLI_URL" -X -v ON_ERROR_STOP=1 -Atqc "$1"
}

printf 'ENGAGEOS_PHASE17_PRODUCTION_READINESS_BEGIN\n'
printf 'UTC_TIMESTAMP=%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
printf 'HOSTNAME=%s\n' "$(hostname)"
printf 'TARGET_ROLLOUT_STAGE=INTERNAL_TEST_IDENTITIES\n'
printf 'TARGET_ROLLOUT_MODE=SHADOW\n'
printf 'EXTERNAL_WRITES_ALLOWED=false\n'

for command_name in git node npm npx psql find sort comm pm2 curl; do
  require_command "$command_name"
done

if [[ ! -f package.json || ! -f prisma/schema.prisma || ! -d prisma/migrations ]]; then
  fail "run from apps/whatsapp-agent-dashboard with Prisma migrations present"
fi
if [[ -z "$EXPECTED_RELEASE_SHA" ]]; then
  fail "EXPECTED_RELEASE_SHA is required"
fi

current_sha="$(git rev-parse HEAD 2>/dev/null || true)"
current_branch="$(git branch --show-current 2>/dev/null || true)"
printf 'CURRENT_GIT_SHA=%s\n' "$current_sha"
printf 'CURRENT_GIT_BRANCH=%s\n' "${current_branch:-DETACHED}"
if [[ -n "$EXPECTED_RELEASE_SHA" && "$current_sha" == "$EXPECTED_RELEASE_SHA" ]]; then
  pass "Git HEAD matches expected release SHA"
else
  fail "Git HEAD does not match EXPECTED_RELEASE_SHA"
fi

# Production keeps rollback builds and diagnostic helpers as untracked recovery
# artifacts. They must not invalidate Stage 1 readiness. Any tracked source
# modification still fails closed, matching the production deployment gate.
if [[ -z "$(git status --porcelain --untracked-files=no 2>/dev/null)" ]]; then
  pass "Git tracked worktree is clean"
else
  fail "Git tracked worktree has changes"
fi

if [[ -f "$ENV_FILE" ]]; then
  pass "environment file found: $ENV_FILE"
  persisted_master="$(read_env_value ENGAGEOS_SECURITY_PERSISTENCE_ENABLED "$ENV_FILE")"
else
  fail "environment file not found: $ENV_FILE"
  persisted_master=""
fi

runtime_master="${ENGAGEOS_SECURITY_PERSISTENCE_ENABLED:-$persisted_master}"
normalized_master="$(printf '%s' "$runtime_master" | tr '[:upper:]' '[:lower:]' | xargs)"
printf 'ENGAGEOS_SECURITY_MASTER=%s\n' "${normalized_master:-absent}"
if [[ -z "$normalized_master" || "$normalized_master" == "false" || "$normalized_master" == "0" ]]; then
  pass "EngageOS security master is inactive for SHADOW readiness"
else
  fail "EngageOS security master must remain absent or false for initial SHADOW readiness"
fi

if [[ -z "${DATABASE_URL:-}" && -f "$ENV_FILE" ]]; then
  DATABASE_URL="$(read_env_value DATABASE_URL "$ENV_FILE")"
fi

DATABASE_CLI_URL=""
if [[ -z "${DATABASE_URL:-}" ]]; then
  fail "DATABASE_URL is not exported and was not found in ENV_FILE"
else
  export DATABASE_URL
  if DATABASE_CLI_URL="$(node scripts/prisma-postgres-cli-url.mjs "$DATABASE_URL" 2>/tmp/engageos-phase17-database-url-error.log)"; then
    export DATABASE_CLI_URL
    pass "PostgreSQL CLI connection URL prepared without exposing credentials"
  else
    fail "DATABASE_URL could not be prepared for PostgreSQL CLI tools"
    sed -n '1,20p' /tmp/engageos-phase17-database-url-error.log
  fi
fi

if [[ -n "${DATABASE_URL:-}" ]]; then
  if npx prisma validate >/tmp/engageos-phase17-prisma-validate.log 2>&1; then
    pass "Prisma schema validates"
  else
    fail "Prisma schema validation failed"
    sed -n '1,80p' /tmp/engageos-phase17-prisma-validate.log
  fi
fi

if [[ -n "$DATABASE_CLI_URL" ]]; then
  if database_identity="$(psql "$DATABASE_CLI_URL" -X -v ON_ERROR_STOP=1 -Atqc "SELECT current_database() || '|' || current_user || '|' || current_setting('server_version');" 2>/tmp/engageos-phase17-psql-error.log)"; then
    IFS='|' read -r database_name database_user database_version <<<"$database_identity"
    printf 'DATABASE_NAME=%s\n' "$database_name"
    printf 'DATABASE_USER=%s\n' "$database_user"
    printf 'DATABASE_VERSION=%s\n' "$database_version"
    pass "PostgreSQL connection is reachable"

    migration_table_exists="$(psql_scalar "SELECT CASE WHEN to_regclass('public._prisma_migrations') IS NULL THEN 'false' ELSE 'true' END;")"
    printf 'PRISMA_MIGRATION_TABLE_EXISTS=%s\n' "$migration_table_exists"
    if [[ "$migration_table_exists" != "true" ]]; then
      fail "Prisma migration history table is missing"
    else
      unfinished_count="$(psql_scalar 'SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL;')"
      printf 'PRISMA_UNFINISHED_OR_ROLLED_BACK_COUNT=%s\n' "$unfinished_count"
      if [[ "$unfinished_count" == "0" ]]; then
        pass "Prisma migration history has no unfinished or rolled-back rows"
      else
        fail "Prisma migration history contains unfinished or rolled-back rows"
      fi

      legacy_init_count="$(psql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '${LEGACY_INIT_MIGRATION}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
      printf 'LEGACY_INIT_APPLIED_COUNT=%s\n' "$legacy_init_count"
      if [[ "$legacy_init_count" == "1" ]]; then
        pass "legacy migration is applied exactly once"
      else
        fail "legacy migration must be applied exactly once"
      fi

      repo_migrations="$(find prisma/migrations -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)"
      applied_migrations="$(psql_scalar 'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name;')"
      recognized_migrations="$(printf '%s\n%s\n' "$LEGACY_INIT_MIGRATION" "$repo_migrations" | sed '/^$/d' | sort -u)"

      pending_repo_migrations="$(comm -23 <(printf '%s\n' "$repo_migrations") <(printf '%s\n' "$applied_migrations") || true)"
      unknown_applied_migrations="$(comm -13 <(printf '%s\n' "$recognized_migrations") <(printf '%s\n' "$applied_migrations") || true)"
      pending_count="$(printf '%s\n' "$pending_repo_migrations" | sed '/^$/d' | wc -l | tr -d ' ')"
      unknown_count="$(printf '%s\n' "$unknown_applied_migrations" | sed '/^$/d' | wc -l | tr -d ' ')"
      printf 'PENDING_REPO_MIGRATION_COUNT=%s\n' "$pending_count"
      printf 'UNKNOWN_APPLIED_MIGRATION_COUNT=%s\n' "$unknown_count"

      if [[ "$pending_count" == "0" ]]; then
        pass "all committed repository migrations are applied"
      else
        fail "production database has unapplied committed migrations"
      fi
      if [[ "$unknown_count" == "0" ]]; then
        pass "production migration lineage contains only recognized migrations"
      else
        fail "production migration lineage contains migrations absent from the release repository"
      fi
    fi

    phase16_tables=(
      EngageAgencyWorkspaceLink
      EngageWorkspaceSaasState
      EngagePublicApiKey
      EngageWorkspaceUsageEvent
      EngageWhiteLabelConfig
      EngageCustomDomain
      EngageDeveloperRequestLog
      EngageOutboundWebhookEndpoint
    )
    missing_phase16_tables=0
    for table_name in "${phase16_tables[@]}"; do
      exists="$(psql_scalar "SELECT CASE WHEN to_regclass('public.\"${table_name}\"') IS NULL THEN 'false' ELSE 'true' END;")"
      if [[ "$exists" == "true" ]]; then
        pass "Phase 16 table exists: $table_name"
      else
        fail "Phase 16 table missing: $table_name"
        missing_phase16_tables=$((missing_phase16_tables + 1))
      fi
    done
    printf 'PHASE16_MISSING_TABLE_COUNT=%s\n' "$missing_phase16_tables"

    webhook_required_columns=(workspaceId events status algorithm keyVersion initializationVector authenticationTag ciphertext)
    webhook_required_column_count=0
    for column_name in "${webhook_required_columns[@]}"; do
      exists="$(psql_scalar "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'EngageOutboundWebhookEndpoint' AND column_name = '${column_name}';")"
      if [[ "$exists" == "1" ]]; then
        webhook_required_column_count=$((webhook_required_column_count + 1))
      fi
    done
    printf 'PHASE16E_WEBHOOK_REQUIRED_ENCRYPTED_COLUMN_COUNT=%s\n' "$webhook_required_column_count"
    if [[ "$webhook_required_column_count" == "8" ]]; then
      pass "Phase 16E webhook encrypted schema columns are present"
    else
      fail "Phase 16E webhook encrypted schema columns are incomplete"
    fi

    plaintext_secret_column_count="$(psql_scalar "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'EngageOutboundWebhookEndpoint' AND lower(column_name) IN ('plaintext','plaintextsecret','signingsecret','webhooksecret','secret');")"
    printf 'PHASE16E_WEBHOOK_PLAINTEXT_SECRET_COLUMN_COUNT=%s\n' "$plaintext_secret_column_count"
    if [[ "$plaintext_secret_column_count" == "0" ]]; then
      pass "Phase 16E webhook table exposes no plaintext-secret column"
    else
      fail "Phase 16E webhook table contains a forbidden plaintext-secret column"
    fi

    flag_rows="$(psql_scalar "SELECT key || '=' || CASE WHEN enabled THEN 'true' ELSE 'false' END FROM \"EngageFeatureFlag\" WHERE \"workspaceId\" = 'engagews_default' AND key IN ('engageos.route_permissions','engageos.outbound_policy','engageos.webhook_replay') ORDER BY key;")"
    printf 'ENGAGEOS_FLAGS_BEGIN\n%s\nENGAGEOS_FLAGS_END\n' "$flag_rows"
    flag_count="$(printf '%s\n' "$flag_rows" | sed '/^$/d' | wc -l | tr -d ' ')"
    enabled_flag_count="$(printf '%s\n' "$flag_rows" | grep -c '=true$' || true)"
    if [[ "$flag_count" == "3" && "$enabled_flag_count" == "0" ]]; then
      pass "initial SHADOW safety flags exist and remain disabled"
    else
      fail "initial SHADOW safety flags are missing or already enabled"
    fi
  else
    fail "PostgreSQL connection failed"
    sed -n '1,40p' /tmp/engageos-phase17-psql-error.log
  fi
fi

if pm2 describe "$PM2_PROCESS_NAME" >/tmp/engageos-phase17-pm2-describe.log 2>&1; then
  pass "PM2 process exists: $PM2_PROCESS_NAME"
  pm2 pid "$PM2_PROCESS_NAME" | sed 's/^/PM2_PID=/'
else
  fail "PM2 process not found: $PM2_PROCESS_NAME"
fi

login_status="$(curl -L -sS -o /dev/null -w '%{http_code}' --max-time 20 "${CHECK_HTTP_URL%/}/login" || true)"
printf 'LOGIN_HTTP_STATUS=%s\n' "$login_status"
if [[ "$login_status" == "200" ]]; then
  pass "login route returned HTTP 200"
else
  fail "login route did not return HTTP 200"
fi

printf 'READINESS_WARNINGS=%s\n' "$warnings"
printf 'READINESS_FAILURES=%s\n' "$failures"
if [[ "$failures" -eq 0 ]]; then
  printf 'PHASE17_STAGE1_READINESS=PASS\n'
  printf 'ENGAGEOS_PHASE17_PRODUCTION_READINESS_END\n'
  exit 0
fi
printf 'PHASE17_STAGE1_READINESS=FAIL\n'
printf 'ENGAGEOS_PHASE17_PRODUCTION_READINESS_END\n'
exit 1
