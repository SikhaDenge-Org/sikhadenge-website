#!/usr/bin/env bash
set -Eeuo pipefail

workflow_path="../../.github/workflows/whatsapp-agent-route-permissions-activation.yml"
activate_script="scripts/engageos-route-permissions-activate.sh"
disable_script="scripts/engageos-route-permissions-disable.sh"

for path in "$activate_script" "$disable_script"; do
  test -f "$path"
  bash -n "$path"
done

test -f "$workflow_path"

forbidden_patterns=(
  'git[[:space:]]+clean'
  'rm[[:space:]]+-rf'
  'source[[:space:]]+.*\.env'
  '(^|[[:space:]])\.[[:space:]]+.*\.env'
  'ssh-keyscan'
  'DROP[[:space:]]+TABLE'
  'TRUNCATE[[:space:]]+TABLE'
  'DELETE[[:space:]]+FROM'
  'ALTER[[:space:]]+TABLE'
  'echo[[:space:]].*DATABASE_URL'
  'printf[[:space:]].*DATABASE_URL'
)

for pattern in "${forbidden_patterns[@]}"; do
  if grep -Ein "$pattern" "$activate_script" "$disable_script" "$workflow_path"; then
    printf 'Forbidden route-permissions automation pattern detected: %s\n' "$pattern" >&2
    exit 1
  fi
done

if grep -Eq '^[[:space:]]+push:' "$workflow_path"; then
  printf 'Route-permissions activation workflow must remain manual-only.\n' >&2
  exit 1
fi

for required_text in \
  'workflow_dispatch:' \
  'operation:' \
  'expected_live_sha:' \
  'default: false' \
  'ENABLE_ROUTE_PERMISSIONS' \
  'DISABLE_ROUTE_PERMISSIONS' \
  'environment: whatsapp-agent-production' \
  'group: whatsapp-agent-production' \
  'WHATSAPP_PROD_HOST' \
  'WHATSAPP_PROD_USER' \
  'WHATSAPP_PROD_SSH_PRIVATE_KEY' \
  'WHATSAPP_PROD_SSH_HOST_KEY' \
  'base64 --decode' \
  'ssh-keygen -y -f' \
  'StrictHostKeyChecking=yes' \
  'ConnectTimeout=15' \
  'PASS: PINNED_SSH_TRANSPORT_VERIFIED' \
  'test "$EXECUTE" = "true"' \
  'test "$CONFIRMATION" = "$expected_confirmation"' \
  'engageos-route-permissions-activate.sh' \
  'engageos-route-permissions-disable.sh' \
  'actions/upload-artifact@v4'; do
  grep -Fq "$required_text" "$workflow_path"
done

for required_text in \
  ': "${EXPECTED_LIVE_SHA:?EXPECTED_LIVE_SHA is required}"' \
  'test "$(git rev-parse HEAD)" = "$EXPECTED_LIVE_SHA"' \
  'git status --porcelain --untracked-files=no' \
  'test "$file_master" = "false"' \
  'test "$pm2_master" = "false"' \
  'reply_ready_count' \
  'test "$reply_ready_count" = "$active_user_count"' \
  'cp -a "$ENV_FILE" "$BACKUP_DIR/.env.before"' \
  'flags-before.txt' \
  'ROLLBACK_REQUIRED=1' \
  'rollback_on_error' \
  'SET "enabled" = false' \
  "'engageos.outbound_policy', 'engageos.webhook_replay'" \
  'SET "enabled" = true' \
  "'engageos.route_permissions'" \
  'write_env_value "$MASTER_KEY" true "$ENV_FILE"' \
  'ENGAGEOS_SECURITY_PERSISTENCE_ENABLED=true' \
  'pm2 restart "$PM2_PROCESS_NAME" --update-env' \
  'test "$other_enabled" = "0"' \
  'test "$login_http" = "200"' \
  'test "$inbox_http" = "307"' \
  'PASS: ROUTE_PERMISSIONS_ACTIVATION_COMPLETE'; do
  grep -Fq "$required_text" "$activate_script"
done

for required_text in \
  ': "${EXPECTED_LIVE_SHA:?EXPECTED_LIVE_SHA is required}"' \
  'test "$(git rev-parse HEAD)" = "$EXPECTED_LIVE_SHA"' \
  'git status --porcelain --untracked-files=no' \
  'cp -a "$ENV_FILE" "$BACKUP_DIR/.env.before-disable"' \
  'flags-before-disable.txt' \
  'fail_safe_on_error' \
  'SET "enabled" = false' \
  "'engageos.route_permissions'" \
  'write_env_value "$MASTER_KEY" false "$ENV_FILE"' \
  'ENGAGEOS_SECURITY_PERSISTENCE_ENABLED=false' \
  'pm2 restart "$PM2_PROCESS_NAME" --update-env' \
  'test "$enabled_flag_count" = "0"' \
  'test "$login_http" = "200"' \
  'test "$inbox_http" = "307"' \
  'PASS: ROUTE_PERMISSIONS_DISABLE_COMPLETE'; do
  grep -Fq "$required_text" "$disable_script"
done

printf 'EngageOS route-permissions activation policy test passed.\n'
