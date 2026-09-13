#!/usr/bin/env bash
set -Eeuo pipefail

PROMOTE_SCRIPT=scripts/engageos-phase17-stage2-promote.ts
EVIDENCE_SCRIPT=scripts/engageos-phase17-stage2-whatsapp-evidence.ts
for script in "$PROMOTE_SCRIPT" "$EVIDENCE_SCRIPT"; do test -f "$script"; done

grep -Fq 'APPLY_ONE_CONNECTED_ACCOUNT_SHADOW' "$PROMOTE_SCRIPT"
grep -Fq 'Stage2 promotion requires expected version 1.' "$PROMOTE_SCRIPT"
grep -Fq 'candidate.status !== "CONNECTED"' "$PROMOTE_SCRIPT"
grep -Fq 'targetStage: "ONE_CONNECTED_ACCOUNT"' "$PROMOTE_SCRIPT"
grep -Fq 'targetMode: "SHADOW"' "$PROMOTE_SCRIPT"
grep -Fq 'externalWritesRequested: false' "$PROMOTE_SCRIPT"
grep -Fq 'transitionControlledLaunchState' "$PROMOTE_SCRIPT"
grep -Fq 'PHASE17_STAGE2_MODE=DRY_RUN' "$PROMOTE_SCRIPT"
grep -Fq 'PHASE17_STAGE2_STATE=ONE_CONNECTED_ACCOUNT|SHADOW|NO_EXTERNAL_WRITES|false|2' "$PROMOTE_SCRIPT"
grep -Fq 'history.length !== 2' "$PROMOTE_SCRIPT"
if grep -Eq 'repository\.transitionState\(|prisma\.\$executeRaw|prisma\.\$queryRaw.*UPDATE' "$PROMOTE_SCRIPT"; then
  printf 'FAIL: Stage2 operator bypasses controlled launch application policy\n' >&2
  exit 1
fi

grep -Fq 'RECORD_VERIFIED_WHATSAPP_EVIDENCE' "$EVIDENCE_SCRIPT"
grep -Fq 'verifyMetaProviderReadOnly("META_WHATSAPP")' "$EVIDENCE_SCRIPT"
grep -Fq 'whatsapp_business_messaging' "$EVIDENCE_SCRIPT"
grep -Fq 'whatsapp_business_management' "$EVIDENCE_SCRIPT"
grep -Fq '/subscribed_apps' "$EVIDENCE_SCRIPT"
grep -Fq 'persistMetaApiVerification' "$EVIDENCE_SCRIPT"
grep -Fq 'recordMetaPermissionEvidence' "$EVIDENCE_SCRIPT"
grep -Fq 'PHASE17_STAGE2_WHATSAPP_EVIDENCE_MODE=DRY_RUN' "$EVIDENCE_SCRIPT"
grep -Fq 'PHASE17_STAGE2_WHATSAPP_PROVIDER_WRITE_SENT=false' "$EVIDENCE_SCRIPT"
if grep -Fq 'recordMetaWebhookEvidence' "$EVIDENCE_SCRIPT"; then
  printf 'FAIL: Stage2 evidence reconciler must never synthesize signed webhook evidence\n' >&2
  exit 1
fi

printf 'PASS: PHASE17_STAGE2_OPERATOR_POLICY_CONTRACT\n'
