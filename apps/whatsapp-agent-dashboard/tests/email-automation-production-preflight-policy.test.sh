#!/usr/bin/env bash
set -Eeuo pipefail
script="scripts/email-automation-production-preflight.sh"
test -f "$script"
bash -n "$script"
grep -Fq 'EXPECTED_RELEASE_SHA is required' "$script"
grep -Fq 'EMAIL_RUNTIME_MODE must equal DRY_RUN' "$script"
grep -Fq 'EMAIL_EXTERNAL_WRITES_ENABLED must remain false' "$script"
grep -Fq 'scheduler token missing or shorter than 32 characters' "$script"
grep -Fq 'protected scheduler health agrees with safe DRY_RUN runtime' "$script"
grep -Fq 'no duplicate scheduler wiring detected' "$script"
grep -Fq 'EMAIL_AUTOMATION_PRODUCTION_PREFLIGHT=PASS' "$script"
if grep -Eqi 'pm2 restart|pm2 reload|systemctl enable|systemctl start|systemctl restart|crontab[[:space:]]+-[er]|tee[[:space:]]+/etc/cron|prisma migrate|UPDATE[[:space:]]+|INSERT[[:space:]]+INTO|DELETE[[:space:]]+FROM' "$script"; then
  printf 'Email scheduler production preflight must remain read-only.\n' >&2
  exit 1
fi
printf 'Email automation production scheduler preflight policy: PASS\n'