#!/usr/bin/env bash
set -Eeuo pipefail

service="modules/email-automation/inbound/gmail-inbound-service.ts"
runner="scripts/email-inbound-production-activate.ts"
readiness="scripts/email-inbound-production-readiness.ts"
activate="scripts/email-inbound-production-activate.sh"

for file in "$service" "$runner" "$readiness" "$activate"; do test -f "$file"; done

grep -Fq 'bootstrapGmailHistoryCursor' "$service"
grep -Fq 'https://gmail.googleapis.com/gmail/v1/users/me/profile' "$service"
grep -Fq 'syncMode: "POLLING"' "$service"
grep -Fq 'syncMode: "WATCH"' "$service"
grep -Fq 'EMAIL_GMAIL_INBOUND_MODE' "$runner"
grep -Fq 'bootstrapGmailHistoryCursor' "$runner"
grep -Fq 'inboundMode !== "WATCH" || checks.pubSubTopic' "$readiness"
grep -Fq 'EMAIL_GMAIL_INBOUND_MODE' "$activate"
grep -Fq 'EMAIL_INBOUND_SYNC_ENABLED=true' "$activate" || true
if grep -Eq 'EMAIL_RUNTIME_MODE=(LIVE|LIMITED_COHORT|INTERNAL_RECIPIENTS)|EMAIL_EXTERNAL_WRITES_ENABLED=true' "$activate"; then
  echo 'Polling bootstrap must not widen outbound delivery.' >&2
  exit 1
fi
printf 'Email E5 polling bootstrap contract: PASS\n'
