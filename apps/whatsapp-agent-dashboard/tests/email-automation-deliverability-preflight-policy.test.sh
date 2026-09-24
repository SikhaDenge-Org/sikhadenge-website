#!/usr/bin/env bash
set -Eeuo pipefail
cli="scripts/email-automation-deliverability-preflight.ts"
test -f "$cli"

npm exec -- tsx "$cli" DRY_RUN >/tmp/email-deliverability-dryrun.log 2>&1
grep -Fq 'EMAIL_DELIVERABILITY_PREFLIGHT_ENFORCED=false' /tmp/email-deliverability-dryrun.log
grep -Fq 'EMAIL_DELIVERABILITY_PREFLIGHT=PASS' /tmp/email-deliverability-dryrun.log

if npm exec -- tsx "$cli" LIMITED_COHORT >/tmp/email-deliverability-missing.log 2>&1; then
  echo 'LIMITED_COHORT must fail when deliverability evidence is missing.' >&2
  exit 1
fi
grep -Fq 'EMAIL_DELIVERABILITY_PREFLIGHT=FAIL' /tmp/email-deliverability-missing.log

EMAIL_DELIVERABILITY_SPF_ALIGNED=true \
EMAIL_DELIVERABILITY_DKIM_ALIGNED=true \
EMAIL_DELIVERABILITY_DMARC_ALIGNED=true \
EMAIL_DELIVERABILITY_HARD_BOUNCE_RATE_PCT=4.99 \
EMAIL_DELIVERABILITY_COMPLAINT_RATE_PCT=0.09 \
npm exec -- tsx "$cli" LIMITED_COHORT >/tmp/email-deliverability-qualified.log 2>&1
grep -Fq 'EMAIL_DELIVERABILITY_PREFLIGHT=PASS' /tmp/email-deliverability-qualified.log

if EMAIL_DELIVERABILITY_SPF_ALIGNED=true \
  EMAIL_DELIVERABILITY_DKIM_ALIGNED=true \
  EMAIL_DELIVERABILITY_DMARC_ALIGNED=true \
  EMAIL_DELIVERABILITY_HARD_BOUNCE_RATE_PCT=5 \
  EMAIL_DELIVERABILITY_COMPLAINT_RATE_PCT=0.09 \
  npm exec -- tsx "$cli" LIVE >/tmp/email-deliverability-bounce-block.log 2>&1; then
  echo 'LIVE must fail at the hard-bounce safety ceiling.' >&2
  exit 1
fi

if EMAIL_DELIVERABILITY_SPF_ALIGNED=true \
  EMAIL_DELIVERABILITY_DKIM_ALIGNED=true \
  EMAIL_DELIVERABILITY_DMARC_ALIGNED=true \
  EMAIL_DELIVERABILITY_HARD_BOUNCE_RATE_PCT=1 \
  EMAIL_DELIVERABILITY_COMPLAINT_RATE_PCT=0.1 \
  npm exec -- tsx "$cli" LIVE >/tmp/email-deliverability-complaint-block.log 2>&1; then
  echo 'LIVE must fail at the complaint safety ceiling.' >&2
  exit 1
fi

rm -f /tmp/email-deliverability-*.log
echo 'Email automation deliverability production preflight policy: PASS'
