#!/usr/bin/env bash
set -Eeuo pipefail
script="scripts/email-automation-production-preflight.sh"
activate="scripts/email-automation-scheduler-activate.sh"
cohort="scripts/email-automation-production-limited-cohort-window.sh"
deliverability="scripts/email-automation-deliverability-preflight.ts"
for file in "$script" "$activate" "$cohort" "$deliverability"; do
  test -f "$file"
done
for file in "$script" "$activate" "$cohort"; do bash -n "$file"; done
grep -Fq 'EMAIL_PREFLIGHT_EXPECTED_MODE:-DRY_RUN' "$script"
grep -Fq 'EMAIL_PREFLIGHT_EXPECTED_MODE must be DRY_RUN, LIMITED_COHORT, or LIVE' "$script"
grep -Fq 'EXPECTED_RELEASE_SHA is required' "$script"
grep -Fq 'EMAIL_RUNTIME_MODE must equal DRY_RUN' "$script"
grep -Fq 'EMAIL_EXTERNAL_WRITES_ENABLED must remain false for DRY_RUN' "$script"
grep -Fq 'EMAIL_RUNTIME_MODE must equal LIMITED_COHORT' "$script"
grep -Fq 'EMAIL_EXTERNAL_WRITES_ENABLED must be true for LIMITED_COHORT' "$script"
grep -Fq 'EMAIL_RUNTIME_MODE must equal LIVE' "$script"
grep -Fq 'EMAIL_EXTERNAL_WRITES_ENABLED must be true for LIVE' "$script"
grep -Fq 'EMAIL_AUTOMATION_COHORT_ALLOWLIST must contain 1-10 valid recipients' "$script"
grep -Fq 'scheduler token missing or shorter than 32 characters' "$script"
grep -Fq 'protected scheduler health agrees with required $EXPECTED_MODE state' "$script"
grep -Fq 'no duplicate scheduler wiring detected' "$script"
grep -Fq 'scripts/email-automation-deliverability-preflight.ts' "$script"
grep -Fq 'EMAIL_DELIVERABILITY_PREFLIGHT_WORKSPACE_ID' "$script"
grep -Fq 'EMAIL_DELIVERABILITY_PREFLIGHT_SENDER_EMAIL' "$script"
grep -Fq 'scaled-delivery persisted deliverability evidence qualified' "$script"
grep -Fq 'scaled-delivery persisted deliverability evidence is not qualified' "$script"
if grep -Fq 'EMAIL_DELIVERABILITY_SPF_ALIGNED' "$script" || \
  grep -Fq 'EMAIL_DELIVERABILITY_DKIM_ALIGNED' "$script" || \
  grep -Fq 'EMAIL_DELIVERABILITY_DMARC_ALIGNED' "$script" || \
  grep -Fq 'EMAIL_DELIVERABILITY_HARD_BOUNCE_RATE_PCT="$(value_for' "$script" || \
  grep -Fq 'EMAIL_DELIVERABILITY_COMPLAINT_RATE_PCT="$(value_for' "$script"; then
  printf 'Scaled preflight must not trust manual deliverability evidence env values.\n' >&2
  exit 1
fi
grep -Fq 'EMAIL_AUTOMATION_PRODUCTION_PREFLIGHT=PASS' "$script"
grep -Fq 'EMAIL_PREFLIGHT_EXPECTED_MODE="$PREFLIGHT_EXPECTED_MODE"' "$activate"
grep -Fq 'EMAIL_PREFLIGHT_EXPECTED_MODE=LIMITED_COHORT' "$cohort"
grep -Fq 'EMAIL_PREFLIGHT_EXPECTED_MODE=DRY_RUN' "$cohort"
grep -Fq 'sync_pm2_email_env_from_file' "$cohort"
grep -Fq 'EMAIL_AUTOMATION_COHORT_ALLOWLIST' "$cohort"
grep -Fq 'sync-pm2-limited-cohort-env' "$cohort"
grep -Fq 'restore-pm2-env' "$cohort"
grep -Fq 'FAILED_STAGE=' "$cohort"
if grep -Eqi 'pm2 restart|pm2 reload|systemctl enable|systemctl start|systemctl restart|crontab[[:space:]]+-[er]|tee[[:space:]]+/etc/cron|prisma migrate|UPDATE[[:space:]]+|INSERT[[:space:]]+INTO|DELETE[[:space:]]+FROM' "$script"; then
  printf 'Email scheduler production preflight must remain read-only.\n' >&2
  exit 1
fi
printf 'Email automation production scheduler preflight policy: PASS\n'