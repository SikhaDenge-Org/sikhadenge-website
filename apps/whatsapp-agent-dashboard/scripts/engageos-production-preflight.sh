#!/usr/bin/env bash
set -Eeuo pipefail

EXPECTED_RELEASE_SHA="${EXPECTED_RELEASE_SHA:-}"
ENV_FILE="${ENV_FILE:-.env}"
PM2_PROCESS_NAME="${PM2_PROCESS_NAME:-sikhadenge-whatsapp-agent}"
CHECK_HTTP_URL="${CHECK_HTTP_URL:-https://whatsapp.sikhadenge.in}"
VERIFY_PG_DUMP="${VERIFY_PG_DUMP:-1}"

LEGACY_INIT_MIGRATION="20260723160037_init_whatsapp_agent"
PHASE2_BASELINE_MIGRATION="20260802000000_baseline_existing_schema"
PHASE2_ADDITIVE_MIGRATION="20260802174500_add_engageos_security_persistence"
PHASE16A_MIGRATION="20260911150000_add_phase16a_saas_persistence"

failures=0
warnings=0

pass() { printf 'PASS: %s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*"; warnings=$((warnings + 1)); }
fail() { printf 'FAIL: %s\n' "$*"; failures=$((failures + 1)); }
info() { printf 'INFO: %s\n' "$*"; }

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

printf 'ENGAGEOS_PRODUCTION_PREFLIGHT_BEGIN\n'
printf 'UTC_TIMESTAMP=%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
printf 'HOSTNAME=%s\n' "$(hostname)"

for command_name in git node npm npx psql; do
  require_command "$command_name"
done
if [[ "$VERIFY_PG_DUMP" == "1" ]]; then
  require_command pg_dump
fi

if [[ ! -f package.json || ! -f prisma/schema.prisma ]]; then
  fail "run from apps/whatsapp-agent-dashboard"
fi
if [[ -z "$EXPECTED_RELEASE_SHA" ]]; then
  fail "EXPECTED_RELEASE_SHA is required"
fi

if [[ -f "$ENV_FILE" ]]; then
  pass "environment file found: $ENV_FILE"
  persisted_master="$(read_env_value ENGAGEOS_SECURITY_PERSISTENCE_ENABLED "$ENV_FILE")"
else
  warn "environment file not found: $ENV_FILE"
  persisted_master=""
fi

runtime_master="${ENGAGEOS_SECURITY_PERSISTENCE_ENABLED:-$persisted_master}"
normalized_master="$(printf '%s' "$runtime_master" | tr '[:upper:]' '[:lower:]' | xargs)"
printf 'ENGAGEOS_SECURITY_MASTER=%s\n' "${normalized_master:-absent}"
if [[ -z "$normalized_master" || "$normalized_master" == "false" || "$normalized_master" == "0" ]]; then
  pass "EngageOS security master is inactive"
else
  fail "EngageOS security master must be absent or false before migration/deploy"
fi

if [[ -z "${DATABASE_URL:-}" && -f "$ENV_FILE" ]]; then
  DATABASE_URL="$(read_env_value DATABASE_URL "$ENV_FILE")"
fi

DATABASE_CLI_URL=""
if [[ -z "${DATABASE_URL:-}" ]]; then
  fail "DATABASE_URL is not exported and was not found in ENV_FILE"
else
  export DATABASE_URL
  if DATABASE_CLI_URL="$(node scripts/prisma-postgres-cli-url.mjs "$DATABASE_URL" 2>/tmp/engageos-database-url-error.log)"; then
    export DATABASE_CLI_URL
    pass "PostgreSQL CLI connection URL prepared without Prisma-only parameters"
  else
    fail "DATABASE_URL could not be prepared for PostgreSQL CLI tools"
    sed -n '1,20p' /tmp/engageos-database-url-error.log
  fi
fi

if command -v git >/dev/null 2>&1; then
  current_sha="$(git rev-parse HEAD 2>/dev/null || true)"
  current_branch="$(git branch --show-current 2>/dev/null || true)"
  printf 'CURRENT_GIT_SHA=%s\n' "$current_sha"
  printf 'CURRENT_GIT_BRANCH=%s\n' "${current_branch:-DETACHED}"

  if [[ -n "$EXPECTED_RELEASE_SHA" && "$current_sha" == "$EXPECTED_RELEASE_SHA" ]]; then
    pass "Git HEAD matches expected release SHA"
  elif [[ -n "$EXPECTED_RELEASE_SHA" ]]; then
    fail "Git HEAD does not match EXPECTED_RELEASE_SHA"
  fi

  if [[ -z "$(git status --porcelain --untracked-files=normal 2>/dev/null)" ]]; then
    pass "Git worktree is clean"
  else
    fail "Git worktree has tracked or untracked changes"
  fi
fi

if command -v node >/dev/null 2>&1; then
  printf 'NODE_VERSION=%s\n' "$(node --version)"
fi
if command -v npm >/dev/null 2>&1; then
  printf 'NPM_VERSION=%s\n' "$(npm --version)"
fi
if command -v npx >/dev/null 2>&1 && [[ -f prisma/schema.prisma ]] && [[ -n "${DATABASE_URL:-}" ]]; then
  if npx prisma validate >/tmp/engageos-prisma-validate.log 2>&1; then
    pass "Prisma schema validates"
  else
    fail "Prisma schema validation failed"
    sed -n '1,80p' /tmp/engageos-prisma-validate.log
  fi
fi

if [[ -n "$DATABASE_CLI_URL" ]] && command -v psql >/dev/null 2>&1; then
  database_reachable=false
  if database_identity="$(psql "$DATABASE_CLI_URL" -X -v ON_ERROR_STOP=1 -Atqc "SELECT current_database() || '|' || current_user || '|' || current_setting('server_version');" 2>/tmp/engageos-psql-error.log)"; then
    IFS='|' read -r database_name database_user database_version <<<"$database_identity"
    printf 'DATABASE_NAME=%s\n' "$database_name"
    printf 'DATABASE_USER=%s\n' "$database_user"
    printf 'DATABASE_VERSION=%s\n' "$database_version"
    pass "PostgreSQL connection is reachable"
    database_reachable=true
  else
    fail "PostgreSQL connection failed"
    sed -n '1,40p' /tmp/engageos-psql-error.log
  fi

  if [[ "$database_reachable" == "true" ]]; then
    legacy_tables=(DashboardUser DashboardSession WhatsAppContact WhatsAppConversation WhatsAppMessage WhatsAppTemplate WebhookEvent AuditLog)
    for table_name in "${legacy_tables[@]}"; do
      exists="$(psql_scalar "SELECT CASE WHEN to_regclass('public.\"${table_name}\"') IS NULL THEN 'false' ELSE 'true' END;")"
      if [[ "$exists" == "true" ]]; then
        pass "legacy table exists: $table_name"
      else
        fail "legacy table missing: $table_name"
      fi
    done

    dashboard_user_count="$(psql_scalar 'SELECT COUNT(*) FROM "DashboardUser";')"
    printf 'DASHBOARD_USER_COUNT=%s\n' "$dashboard_user_count"
    if [[ "$dashboard_user_count" =~ ^[0-9]+$ && "$dashboard_user_count" -ge 1 ]]; then
      pass "DashboardUser contains at least one user"
    else
      fail "DashboardUser has no users"
    fi

    migration_table_exists="$(psql_scalar "SELECT CASE WHEN to_regclass('public._prisma_migrations') IS NULL THEN 'false' ELSE 'true' END;")"
    printf 'PRISMA_MIGRATION_TABLE_EXISTS=%s\n' "$migration_table_exists"
    if [[ "$migration_table_exists" == "true" ]]; then
      failed_migrations="$(psql_scalar 'SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL;')"
      printf 'PRISMA_FAILED_OR_ROLLED_BACK_COUNT=%s\n' "$failed_migrations"
      if [[ "$failed_migrations" == "0" ]]; then
        pass "Prisma migration history has no unfinished or rolled-back rows"
      else
        fail "Prisma migration history contains unfinished or rolled-back rows"
      fi

      legacy_init_count="$(psql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '${LEGACY_INIT_MIGRATION}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
      baseline_count="$(psql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '${PHASE2_BASELINE_MIGRATION}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
      additive_count="$(psql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '${PHASE2_ADDITIVE_MIGRATION}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
      phase16a_count="$(psql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '${PHASE16A_MIGRATION}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
      repo_migrations="$(find prisma/migrations -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)"
      applied_migrations="$(psql_scalar 'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name;')"
      recognized_migrations="$(printf '%s\n%s\n' "$LEGACY_INIT_MIGRATION" "$repo_migrations" | sed '/^$/d' | sort -u)"
      unknown_migrations="$(comm -13 <(printf '%s\n' "$recognized_migrations") <(printf '%s\n' "$applied_migrations") || true)"
      unknown_migration_count="$(printf '%s\n' "$unknown_migrations" | sed '/^$/d' | wc -l | tr -d ' ')"

      printf 'LEGACY_INIT_APPLIED_COUNT=%s\n' "$legacy_init_count"
      printf 'COMMITTED_REPO_MIGRATION_COUNT=%s\n' "$(printf '%s\n' "$repo_migrations" | sed '/^$/d' | wc -l | tr -d ' ')"
      printf 'UNKNOWN_MIGRATION_COUNT=%s\n' "$unknown_migration_count"

      if [[ "$legacy_init_count" == "1" ]]; then
        pass "deployed legacy Prisma migration is applied exactly once"
      else
        fail "deployed legacy Prisma migration is missing or duplicated"
      fi

      if [[ "$unknown_migration_count" == "0" ]]; then
        pass "Prisma history contains only recognized migration lineage from the target release"
      else
        fail "Prisma history contains unrecognized migrations absent from the target release"
        printf '%s\n' "$unknown_migrations"
      fi
    else
      legacy_init_count=0
      baseline_count=0
      additive_count=0
      phase16a_count=0
      info "Prisma migration history is absent; one-time baseline is still pending"
    fi

    printf 'BASELINE_APPLIED_COUNT=%s\n' "$baseline_count"
    printf 'ADDITIVE_MIGRATION_APPLIED_COUNT=%s\n' "$additive_count"
    printf 'PHASE16A_MIGRATION_APPLIED_COUNT=%s\n' "$phase16a_count"

    if [[ "$phase16a_count" != "0" && "$phase16a_count" != "1" ]]; then
      fail "Phase 16A migration is missing or duplicated"
    fi

    if [[ "$phase16a_count" == "1" && "$additive_count" != "1" ]]; then
      fail "Phase 16A migration exists without completed security persistence"
    fi

    phase16a_tables=(
      EngageAgencyWorkspaceLink
      EngageWorkspaceSaasState
      EngagePublicApiKey
      EngageWorkspaceUsageEvent
      EngageWhiteLabelConfig
      EngageCustomDomain
      EngageDeveloperRequestLog
    )

    phase16a_table_count=0
    for table_name in "${phase16a_tables[@]}"; do
      exists="$(psql_scalar "SELECT CASE WHEN to_regclass('public.\"${table_name}\"') IS NULL THEN 'false' ELSE 'true' END;")"
      if [[ "$exists" == "true" ]]; then
        phase16a_table_count=$((phase16a_table_count + 1))
      fi
    done

    printf 'PHASE16A_TABLE_COUNT=%s\n' "$phase16a_table_count"

    if [[ "$phase16a_count" == "1" ]]; then
      if [[ "$phase16a_table_count" == "7" ]]; then
        pass "Phase 16A persistence schema is fully applied"
      else
        fail "Phase 16A migration is recorded but persistence schema is incomplete"
      fi
    elif [[ "$phase16a_table_count" == "0" ]]; then
      pass "Phase 16A persistence schema is not yet applied"
    else
      fail "Phase 16A persistence tables exist without completed migration record"
    fi

    engage_workspace_exists="$(psql_scalar "SELECT CASE WHEN to_regclass('public.\"EngageWorkspace\"') IS NULL THEN 'false' ELSE 'true' END;")"
    printf 'ENGAGE_WORKSPACE_TABLE_EXISTS=%s\n' "$engage_workspace_exists"
    if [[ "$engage_workspace_exists" == "true" ]]; then
      if [[ "$baseline_count" != "1" || "$additive_count" != "1" ]]; then
        fail "EngageOS tables exist without completed Phase 2 baseline and additive migration records"
      fi
      engage_tables=(EngageWorkspace EngageWorkspaceMembership EngagePermissionGrant EngageChannelConnection EngageConnectionCredential EngageCustomerConsentEvent EngageCustomerSuppression EngageKillSwitch EngageWebhookReplayRecord EngageSecurityAuditEvent EngageFeatureFlag)
      for table_name in "${engage_tables[@]}"; do
        exists="$(psql_scalar "SELECT CASE WHEN to_regclass('public.\"${table_name}\"') IS NULL THEN 'false' ELSE 'true' END;")"
        if [[ "$exists" == "true" ]]; then
          pass "EngageOS table exists: $table_name"
        else
          fail "EngageOS schema is partially applied; missing table: $table_name"
        fi
      done

      membership_count="$(psql_scalar 'SELECT COUNT(*) FROM "EngageWorkspaceMembership" WHERE "workspaceId" = '\''engagews_default'\'';')"
      printf 'DEFAULT_WORKSPACE_MEMBERSHIP_COUNT=%s\n' "$membership_count"
      if [[ "$membership_count" == "$dashboard_user_count" ]]; then
        pass "default workspace membership count matches DashboardUser count"
      else
        fail "default workspace membership count does not match DashboardUser count"
      fi

      flag_rows="$(psql_scalar "SELECT key || '=' || CASE WHEN enabled THEN 'true' ELSE 'false' END FROM \"EngageFeatureFlag\" WHERE \"workspaceId\" = 'engagews_default' AND key IN ('engageos.route_permissions','engageos.outbound_policy','engageos.webhook_replay') ORDER BY key;")"
      printf 'ENGAGEOS_FLAGS_BEGIN\n%s\nENGAGEOS_FLAGS_END\n' "$flag_rows"
      flag_count="$(printf '%s\n' "$flag_rows" | sed '/^$/d' | wc -l | tr -d ' ')"
      enabled_flag_count="$(printf '%s\n' "$flag_rows" | grep -c '=true$' || true)"
      if [[ "$flag_count" == "3" && "$enabled_flag_count" == "0" ]]; then
        pass "all three EngageOS feature flags exist and are disabled"
      else
        fail "EngageOS feature flags are missing or enabled"
      fi
    else
      if [[ "$additive_count" == "0" ]]; then
        pass "EngageOS tables are absent before additive migration"
      else
        fail "additive migration is recorded but EngageOS tables are absent"
      fi
    fi

    if [[ "$VERIFY_PG_DUMP" == "1" ]] && command -v pg_dump >/dev/null 2>&1; then
      dump_probe="$(mktemp /tmp/engageos-schema-probe.XXXXXX.sql)"
      if pg_dump --schema-only --no-owner --no-privileges "$DATABASE_CLI_URL" >"$dump_probe" 2>/tmp/engageos-pg-dump-error.log && [[ -s "$dump_probe" ]]; then
        printf 'SCHEMA_DUMP_PROBE_SHA256=%s\n' "$(sha256sum "$dump_probe" | awk '{print $1}')"
        pass "schema-only pg_dump probe succeeded"
      else
        fail "schema-only pg_dump probe failed"
        sed -n '1,40p' /tmp/engageos-pg-dump-error.log
      fi
      rm -f "$dump_probe"
    fi
  fi
fi

if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe "$PM2_PROCESS_NAME" >/tmp/engageos-pm2-describe.log 2>&1; then
    pass "PM2 process exists: $PM2_PROCESS_NAME"
    pm2 pid "$PM2_PROCESS_NAME" | sed 's/^/PM2_PID=/'
  else
    fail "PM2 process not found: $PM2_PROCESS_NAME"
  fi
else
  warn "pm2 command not available; process check skipped"
fi

if command -v curl >/dev/null 2>&1 && [[ -n "$CHECK_HTTP_URL" ]]; then
  login_status="$(curl -L -sS -o /dev/null -w '%{http_code}' --max-time 20 "${CHECK_HTTP_URL%/}/login" || true)"
  printf 'LOGIN_HTTP_STATUS=%s\n' "$login_status"
  if [[ "$login_status" == "200" ]]; then
    pass "login route returned HTTP 200"
  else
    fail "login route did not return HTTP 200"
  fi
else
  warn "curl unavailable or CHECK_HTTP_URL empty; HTTP check skipped"
fi

printf 'PREFLIGHT_WARNINGS=%s\n' "$warnings"
printf 'PREFLIGHT_FAILURES=%s\n' "$failures"
if [[ "$failures" -eq 0 ]]; then
  printf 'PREFLIGHT_STATUS=PASS\n'
  printf 'ENGAGEOS_PRODUCTION_PREFLIGHT_END\n'
  exit 0
fi
printf 'PREFLIGHT_STATUS=FAIL\n'
printf 'ENGAGEOS_PRODUCTION_PREFLIGHT_END\n'
exit 1
