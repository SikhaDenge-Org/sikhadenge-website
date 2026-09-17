#!/usr/bin/env bash
set -Eeuo pipefail
provision="scripts/email-automation-dryrun-provision.sh"
test -f "$provision"
bash -n "$provision"
grep -Fq 'read_env_value()' "$provision"
grep -Fq 'sync_pm2_email_env_from_file()' "$provision"
grep -Fq 'EMAIL_RUNTIME_ENABLED EMAIL_AUTOMATION_ENABLED EMAIL_RUNTIME_MODE EMAIL_EXTERNAL_WRITES_ENABLED EMAIL_AUTOMATION_SCHEDULER_TOKEN' "$provision"
grep -Fq 'export "$key=$value"' "$provision"
grep -Fq 'unset "$key"' "$provision"
grep -Fq 'pm2 restart "$PM2_PROCESS_NAME" --update-env' "$provision"
grep -Fq 'sync_pm2_email_env_from_file' "$provision"
if grep -Fq 'EMAIL_EXTERNAL_WRITES_ENABLED=true' "$provision" || grep -Fq 'EMAIL_RUNTIME_MODE=LIVE' "$provision"; then
  printf 'PM2 env synchronization must preserve DRY_RUN/no-external-writes safety.\n' >&2
  exit 1
fi
printf 'Email automation PM2 env sync regression: PASS\n'
