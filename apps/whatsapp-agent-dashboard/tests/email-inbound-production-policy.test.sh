#!/usr/bin/env bash
set -Eeuo pipefail

activate="scripts/email-inbound-production-activate.sh"
runner="scripts/email-inbound-production-activate.ts"
readiness="scripts/email-inbound-production-readiness.ts"
workflow="../../.github/workflows/whatsapp-agent-email-inbound-activate.yml"
readiness_workflow="../../.github/workflows/whatsapp-agent-email-inbound-readiness.yml"

for file in "$activate" "$runner" "$readiness" "$workflow" "$readiness_workflow"; do test -f "$file"; done
bash -n "$activate"
grep -Fq 'Email send runtime must remain DRY_RUN' "$activate"
grep -Fq 'Email external writes must remain disabled' "$activate"
grep -Fq 'EMAIL_INBOUND_SYNC_ENABLED' "$activate"
grep -Fq 'FAILED_EMAIL_INBOUND_ACTIVATION_ROLLED_BACK' "$activate"
grep -Fq 'inboundSyncEnabled!==true' "$activate"
grep -Fq 'systemctl is-active --quiet sikhadenge-email-automation-scheduler.timer' "$activate"
grep -Fq 'EMAIL_RUNTIME_MODE' "$runner"
grep -Fq 'DRY_RUN' "$runner"
grep -Fq 'EMAIL_EXTERNAL_WRITES_ENABLED' "$runner"
grep -Fq 'support@sikhadenge.in' "$workflow"
grep -Fq "[email-inbound-activate]" "$workflow"
grep -Fq 'DEPLOYED_SHA: ${{ github.event.before }}' "$workflow"
grep -Fq "[email-inbound-readiness]" "$readiness_workflow"
grep -Fq 'DEPLOYED_SHA: ${{ github.event.before }}' "$readiness_workflow"
if grep -Eq 'EMAIL_RUNTIME_MODE=(LIVE|LIMITED_COHORT|INTERNAL_RECIPIENTS)|EMAIL_EXTERNAL_WRITES_ENABLED=true' "$activate"; then
  echo 'Inbound activation must never widen outbound email delivery mode.' >&2
  exit 1
fi
printf 'Email E5 production inbound safety policy: PASS\n'
