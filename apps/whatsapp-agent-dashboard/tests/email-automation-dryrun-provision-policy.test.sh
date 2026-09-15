#!/usr/bin/env bash
set -Eeuo pipefail
provision="scripts/email-automation-dryrun-provision.sh"
rollback="scripts/email-automation-dryrun-rollback.sh"
for f in "$provision" "$rollback"; do test -f "$f"; bash -n "$f"; done
grep -Fq 'APPLY="${APPLY:-0}"' "$provision"
grep -Fq 'preview only; no env or PM2 mutation performed' "$provision"
grep -Fq 'APPLY=1 requires root' "$provision"
grep -Fq 'randomBytes(48)' "$provision"
grep -Fq 'EMAIL_RUNTIME_MODE:'"'"'DRY_RUN'"'"'' "$provision"
grep -Fq 'EMAIL_EXTERNAL_WRITES_ENABLED:'"'"'false'"'"'' "$provision"
grep -Fq 'cp -a "$ENV_FILE" "$BACKUP_DIR/.env.before"' "$provision"
grep -Fq 'email-automation-production-preflight.sh' "$provision"
grep -Fq 'pm2 restart "$PM2_PROCESS_NAME" --update-env' "$provision"
grep -Fq 'BACKUP_DIR with .env.before is required' "$rollback"
grep -Fq 'cp -a "$BACKUP_DIR/.env.before" "$ENV_FILE"' "$rollback"
if grep -Fq 'EMAIL_RUNTIME_MODE=LIVE' "$provision" || grep -Fq 'EMAIL_EXTERNAL_WRITES_ENABLED=true' "$provision"; then
  printf 'DRY_RUN provisioner must never enable LIVE/external writes.\n' >&2; exit 1
fi
printf 'Email automation DRY_RUN provisioning policy: PASS\n'