#!/usr/bin/env bash
set -Eeuo pipefail

: "${LIVE_APP:?LIVE_APP is required}"
: "${STAGE_APP:?STAGE_APP is required}"
: "${RELEASE_SHA:?RELEASE_SHA is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required}"

ENV_FILE="${ENV_FILE:-${LIVE_APP}/.env}"
PUBLIC_URL="${PUBLIC_URL:-https://whatsapp.sikhadenge.in}"
WORKSPACE_ID="${PHASE17_WORKSPACE_ID:-engagews_default}"
PHASE17_MIGRATION="20260913113000_add_phase17_controlled_launch_state"

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

migration_count="$(psql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name='${PHASE17_MIGRATION}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
[[ "$migration_count" == "1" ]] || fail "Phase17 persistence migration is not applied exactly once"

state_count="$(psql_scalar "SELECT COUNT(*) FROM \"EngageControlledLaunchState\" WHERE \"workspaceId\"='${WORKSPACE_ID}';")"
if [[ "$state_count" == "0" ]]; then
  printf 'INFO: Phase17 state absent; bootstrapping Stage1 SHADOW baseline\n'
  LIVE_APP="$LIVE_APP" STAGE_APP="$STAGE_APP" RELEASE_SHA="$RELEASE_SHA" ENV_FILE="$ENV_FILE" \
    bash "$STAGE_APP/scripts/engageos-production-phase17-stage1-bootstrap.sh"
  state_count="$(psql_scalar "SELECT COUNT(*) FROM \"EngageControlledLaunchState\" WHERE \"workspaceId\"='${WORKSPACE_ID}';")"
fi
[[ "$state_count" == "1" ]] || fail "expected exactly one controlled-launch state"

state_tuple="$(psql_scalar "SELECT \"stage\" || '|' || \"mode\" || '|' || \"writePolicy\" || '|' || CASE WHEN \"externalWritesAllowed\" THEN 'true' ELSE 'false' END || '|' || \"version\"::text || '|' || COALESCE(\"scope\"->>'maxRealLeads','') || '|' || COALESCE(\"scope\"->>'externalWritesRequested','') FROM \"EngageControlledLaunchState\" WHERE \"workspaceId\"='${WORKSPACE_ID}';")"
stage="${state_tuple%%|*}"
transition_count="$(psql_scalar "SELECT COUNT(*) FROM \"EngageControlledLaunchTransition\" WHERE \"workspaceId\"='${WORKSPACE_ID}';")"

connected_count="$(psql_scalar "SELECT jsonb_array_length(COALESCE(\"scope\"->'connectedAccountIds','[]'::jsonb)) FROM \"EngageControlledLaunchState\" WHERE \"workspaceId\"='${WORKSPACE_ID}';")"
instagram_count="$(psql_scalar "SELECT jsonb_array_length(COALESCE(\"scope\"->'instagramAssetIds','[]'::jsonb)) FROM \"EngageControlledLaunchState\" WHERE \"workspaceId\"='${WORKSPACE_ID}';")"
automation_count="$(psql_scalar "SELECT jsonb_array_length(COALESCE(\"scope\"->'automationIds','[]'::jsonb)) FROM \"EngageControlledLaunchState\" WHERE \"workspaceId\"='${WORKSPACE_ID}';")"
counselor_count="$(psql_scalar "SELECT jsonb_array_length(COALESCE(\"scope\"->'counselorGroupIds','[]'::jsonb)) FROM \"EngageControlledLaunchState\" WHERE \"workspaceId\"='${WORKSPACE_ID}';")"
enabled_channel_count="$(psql_scalar "SELECT jsonb_array_length(COALESCE(\"scope\"->'enabledChannels','[]'::jsonb)) FROM \"EngageControlledLaunchState\" WHERE \"workspaceId\"='${WORKSPACE_ID}';")"

case "$stage" in
  INTERNAL_TEST_IDENTITIES)
    [[ "$state_tuple" == "INTERNAL_TEST_IDENTITIES|SHADOW|NO_EXTERNAL_WRITES|false|1|0|false" ]] || fail "Stage1 state is not the exact safe baseline"
    [[ "$transition_count" == "1" ]] || fail "Stage1 transition count must be 1"
    [[ "$connected_count" == "0" && "$instagram_count" == "0" && "$automation_count" == "0" && "$counselor_count" == "0" && "$enabled_channel_count" == "0" ]] || fail "Stage1 scope is not empty"
    profile="STAGE1_SHADOW"
    ;;
  ONE_CONNECTED_ACCOUNT)
    [[ "$state_tuple" == "ONE_CONNECTED_ACCOUNT|SHADOW|NO_EXTERNAL_WRITES|false|2|0|false" ]] || fail "Stage2 state is not exact one-account SHADOW"
    [[ "$transition_count" == "2" ]] || fail "Stage2 transition count must be 2"
    [[ "$connected_count" == "1" && "$instagram_count" == "0" && "$automation_count" == "0" && "$counselor_count" == "0" && "$enabled_channel_count" == "1" ]] || fail "Stage2 scope cardinality is invalid"
    enabled_channel="$(psql_scalar "SELECT \"scope\"->'enabledChannels'->>0 FROM \"EngageControlledLaunchState\" WHERE \"workspaceId\"='${WORKSPACE_ID}';")"
    [[ "$enabled_channel" == "whatsapp" ]] || fail "Stage2 enabled channel must be whatsapp"
    candidate_id="$(psql_scalar "SELECT \"scope\"->'connectedAccountIds'->>0 FROM \"EngageControlledLaunchState\" WHERE \"workspaceId\"='${WORKSPACE_ID}';")"
    candidate_tuple="$(psql_scalar "SELECT \"channel\" || '|' || \"status\" || '|' || COALESCE(\"capabilities\"#>>'{evidence,permissionsVerified}','') || '|' || CASE WHEN COALESCE(\"capabilities\"#>>'{evidence,apiVerifiedAt}','') <> '' THEN 'true' ELSE 'false' END || '|' || CASE WHEN COALESCE(\"capabilities\"#>>'{evidence,webhookVerifiedAt}','') <> '' THEN 'true' ELSE 'false' END FROM \"EngageChannelConnection\" WHERE id='${candidate_id}' AND \"workspaceId\"='${WORKSPACE_ID}';")"
    [[ "$candidate_tuple" == "WHATSAPP|CONNECTED|true|true|true" ]] || fail "Stage2 candidate connection is not fully verified"
    second_transition="$(psql_scalar "SELECT \"toStage\" || '|' || \"toMode\" || '|' || \"toWritePolicy\" || '|' || CASE WHEN \"toExternalWritesAllowed\" THEN 'true' ELSE 'false' END || '|' || \"resultingVersion\"::text FROM \"EngageControlledLaunchTransition\" WHERE \"workspaceId\"='${WORKSPACE_ID}' ORDER BY \"resultingVersion\" ASC OFFSET 1 LIMIT 1;")"
    [[ "$second_transition" == "ONE_CONNECTED_ACCOUNT|SHADOW|NO_EXTERNAL_WRITES|false|2" ]] || fail "Stage2 transition history is invalid"
    profile="STAGE2_ONE_CONNECTED_ACCOUNT_SHADOW"
    ;;
  *)
    fail "unsupported controlled-launch stage for this production batch: ${stage}"
    ;;
esac

active_kill_switches="$(psql_scalar "SELECT COUNT(*) FROM \"EngageKillSwitch\" WHERE \"workspaceId\"='${WORKSPACE_ID}' AND active=true;")"
[[ "$active_kill_switches" == "0" ]] || fail "active emergency kill switch detected"

enabled_flag_count="$(psql_scalar "SELECT COUNT(*) FROM \"EngageFeatureFlag\" WHERE \"workspaceId\"='${WORKSPACE_ID}' AND enabled=true;")"
[[ "$enabled_flag_count" == "0" ]] || fail "high-risk EngageOS feature flags are enabled"

login_status="$(curl -L -sS -o /dev/null -w '%{http_code}' --max-time 20 "${PUBLIC_URL%/}/login" || true)"
[[ "$login_status" == "200" ]] || fail "public login health probe failed"

{
  printf 'RELEASE_SHA=%s\n' "$RELEASE_SHA"
  printf 'WORKSPACE_ID=%s\n' "$WORKSPACE_ID"
  printf 'PROFILE=%s\n' "$profile"
  printf 'STATE=%s\n' "$state_tuple"
  printf 'TRANSITION_COUNT=%s\n' "$transition_count"
  printf 'ACTIVE_KILL_SWITCHES=%s\n' "$active_kill_switches"
  printf 'FEATURE_FLAGS_ENABLED=%s\n' "$enabled_flag_count"
  printf 'LOGIN_HTTP=%s\n' "$login_status"
  printf 'VERIFIED_UTC=%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
} > "$BACKUP_DIR/phase17-postdeploy-evidence.txt"
chmod 600 "$BACKUP_DIR/phase17-postdeploy-evidence.txt"
cat "$BACKUP_DIR/phase17-postdeploy-evidence.txt"
printf 'PASS: PHASE17_POSTDEPLOY_CONTROLLED_LAUNCH_GATE\n'

printf '===== PHASE17: GOVERNANCE RELEASE EXIT GATE =====\n'
LIVE_APP="$LIVE_APP" \
STAGE_APP="$STAGE_APP" \
RELEASE_SHA="$RELEASE_SHA" \
BACKUP_DIR="$BACKUP_DIR" \
ENV_FILE="$ENV_FILE" \
PHASE17_WORKSPACE_ID="$WORKSPACE_ID" \
  bash "$STAGE_APP/scripts/engageos-phase17-governance-release-exit-gate.sh"
