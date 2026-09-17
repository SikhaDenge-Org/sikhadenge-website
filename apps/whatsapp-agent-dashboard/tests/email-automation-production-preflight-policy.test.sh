#!/usr/bin/env bash
set -Eeuo pipefail
script="scripts/email-automation-production-preflight.sh"
activate="scripts/email-automation-scheduler-activate.sh"
cohort="scripts/email-automation-production-limited-cohort-window.sh"
for file in "$script" "$activate" "$cohort"; do
  test -f "$file"
  bash -n "$file"
done
grep -Fq 'EMAIL_PREFLIGHT_EXPECTED_MODE:-DRY_RUN' "$script"
grep -Fq 'EMAIL_PREFLIGHT_EXPECTED_MODE must be DRY_RUN or LIMITED_COHORT' "$script"
grep -Fq 'EXPECTED_RELEASE_SHA is required' "$script"
grep -Fq 'EMAIL_RUNTIME_MODE must equal DRY_RUN' "$script"
grep -Fq 'EMAIL_EXTERNAL_WRITES_ENABLED must remain false for DRY_RUN' "$script"
grep -Fq 'EMAIL_RUNTIME_MODE must equal LIMITED_COHORT' "$script"
grep -Fq 'EMAIL_EXTERNAL_WRITES_ENABLED must be true for LIMITED_COHORT' "$script"
grep -Fq 'EMAIL_AUTOMATION_COHORT_ALLOWLIST must contain 1-10 valid recipients' "$script"
grep -Fq 'scheduler token missing or shorter than 32 characters' "$script"
grep -Fq 'protected scheduler health agrees with required $EXPECTED_MODE state' "$script"
grep -Fq 'no duplicate scheduler wiring detected' "$script"
grep -Fq 'EMAIL_AUTOMATION_PRODUCTION_PREFLIGHT=PASS' "$script"
grep -Fq 'EMAIL_PREFLIGHT_EXPECTED_MODE="$PREFLIGHT_EXPECTED_MODE"' "$activate"
grep -Fq 'EMAIL_PREFLIGHT_EXPECTED_MODE=LIMITED_COHORT' "$cohort"
grep -Fq 'EMAIL_PREFLIGHT_EXPECTED_MODE=DRY_RUN' "$cohort"
if grep -Eqi 'pm2 restart|pm2 reload|systemctl enable|systemctl start|systemctl restart|crontab[[:space:]]+-[er]|tee[[:space:]]+/etc/cron|prisma migrate|UPDATE[[:space:]]+|INSERT[[:space:]]+INTO|DELETE[[:space:]]+FROM' "$script"; then
  printf 'Email scheduler production preflight must remain read-only.\n' >&2
  exit 1
fi
printf 'Email automation production scheduler preflight policy: PASS\n'