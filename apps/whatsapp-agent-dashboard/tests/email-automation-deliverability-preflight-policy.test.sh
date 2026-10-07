#!/usr/bin/env bash
set -Eeuo pipefail
cli="scripts/email-automation-deliverability-preflight.ts"
test -f "$cli"

grep -Fq 'loadPersistedEmailDeliverabilitySnapshot' "$cli"
grep -Fq 'EMAIL_DELIVERABILITY_PREFLIGHT_WORKSPACE_ID is required' "$cli"
grep -Fq 'EMAIL_DELIVERABILITY_PREFLIGHT_SENDER_EMAIL must be a valid email address' "$cli"

npm exec -- tsx "$cli" DRY_RUN >/tmp/email-deliverability-dryrun.log 2>&1
grep -Fq 'EMAIL_DELIVERABILITY_PREFLIGHT_ENFORCED=false' /tmp/email-deliverability-dryrun.log
grep -Fq 'EMAIL_DELIVERABILITY_PREFLIGHT=PASS' /tmp/email-deliverability-dryrun.log

if npm exec -- tsx "$cli" LIMITED_COHORT >/tmp/email-deliverability-missing.log 2>&1; then
  echo 'LIMITED_COHORT must fail when persisted evidence target is missing.' >&2
  exit 1
fi
grep -Fq 'EMAIL_DELIVERABILITY_PREFLIGHT=FAIL' /tmp/email-deliverability-missing.log

if EMAIL_DELIVERABILITY_SPF_ALIGNED=true \
  EMAIL_DELIVERABILITY_DKIM_ALIGNED=true \
  EMAIL_DELIVERABILITY_DMARC_ALIGNED=true \
  EMAIL_DELIVERABILITY_HARD_BOUNCE_RATE_PCT=0 \
  EMAIL_DELIVERABILITY_COMPLAINT_RATE_PCT=0 \
  npm exec -- tsx "$cli" LIVE >/tmp/email-deliverability-legacy-bypass.log 2>&1; then
  echo 'Legacy deliverability env values must never qualify LIVE delivery.' >&2
  exit 1
fi
grep -Fq 'EMAIL_DELIVERABILITY_PREFLIGHT=FAIL' /tmp/email-deliverability-legacy-bypass.log

rm -f /tmp/email-deliverability-*.log
echo 'Email P1 persisted deliverability production preflight policy: PASS'