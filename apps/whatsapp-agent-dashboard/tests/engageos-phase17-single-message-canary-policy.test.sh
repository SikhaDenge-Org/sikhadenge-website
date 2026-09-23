#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT="scripts/engageos-phase17-single-message-canary.ts"
REFRESH_SCRIPT="scripts/engageos-phase17-w6-canary-queue-refresh.ts"

test -f "$SCRIPT"

grep -Fq 'dispatchOutboundMessage(messageId)' "$SCRIPT"
if grep -Fq 'dispatchQueuedOutboundBatch' "$SCRIPT"; then
  echo 'FAIL: canary executor must never use batch dispatch' >&2
  exit 1
fi

grep -Fq 'message.type !== MessageType.TEXT && !isApprovedCanaryTemplate' "$SCRIPT"
grep -Fq 'message.type === MessageType.TEMPLATE' "$SCRIPT"
grep -Fq 'canary.designated === true' "$SCRIPT"
grep -Fq 'canary.kind === "INTERNAL_TEST"' "$SCRIPT"
grep -Fq 'hasCanaryTag' "$SCRIPT"
grep -Fq 'outbound.templateName === "hello_world"' "$SCRIPT"
grep -Fq 'PHASE17_CANARY_IDEMPOTENCY_PREFIX' "$SCRIPT"
grep -Fq '"phase22d-internal-canary:"' "$SCRIPT"
grep -Fq 'outbound.idempotencyKey.startsWith(requiredIdempotencyPrefix)' "$SCRIPT"
grep -Fq 'prisma.whatsAppTemplate.findUnique' "$SCRIPT"
grep -Fq 'template.status === TemplateStatus.APPROVED' "$SCRIPT"
grep -Fq 'template.name === "hello_world"' "$SCRIPT"
grep -Fq 'template.language === "en_US"' "$SCRIPT"
grep -Fq '!hasTemplateVariables(template.components)' "$SCRIPT"
grep -Fq 'message.actor !== MessageActor.COUNSELOR' "$SCRIPT"
grep -Fq 'message.status !== MessageStatus.QUEUED' "$SCRIPT"
grep -Fq 'PHASE17_CANARY_MACHINE_EVIDENCE_VERIFIED' "$SCRIPT"
grep -Fq 'targetMode: "APPROVAL_ONLY"' "$SCRIPT"
grep -Fq 'approveControlledLaunchOutbound' "$SCRIPT"
grep -Fq 'revokeControlledLaunchOutboundApproval' "$SCRIPT"
grep -Fq 'writePolicy: "NO_EXTERNAL_WRITES"' "$SCRIPT"
grep -Fq 'externalWritesAllowed: false' "$SCRIPT"
grep -Fq 'externalWhatsAppWriteSent: false' "$SCRIPT"
grep -Fq 'Canary target is stale; queue a fresh message within 30 minutes.' "$SCRIPT"
grep -Fq 'Safety restore refused because controlled-launch state no longer matches this canary.' "$SCRIPT"

if grep -Eq 'writeFile|appendFile|\.env.*=' "$SCRIPT"; then
  echo 'FAIL: canary executor must not mutate environment files' >&2
  exit 1
fi

test -f "$REFRESH_SCRIPT"
grep -Fq 'queueOutboundMessage' "$REFRESH_SCRIPT"
grep -Fq 'W6_CANARY_SUPERSEDED' "$REFRESH_SCRIPT"
grep -Fq 'whatsAppMessageStatusEvent.create' "$REFRESH_SCRIPT"
grep -Fq 'MessageStatus.FAILED' "$REFRESH_SCRIPT"
grep -Fq 'REFRESH_ONE_STALE_W5_INTERNAL_CANARY_QUEUE' "$REFRESH_SCRIPT"
grep -Fq 'W6_REFRESH_EXTERNAL_WHATSAPP_WRITE_SENT=false' "$REFRESH_SCRIPT"
if grep -Eq 'dispatchOutboundMessage|dispatchQueuedOutboundBatch|sendMetaWhatsAppMessage|uploadMetaWhatsAppMedia' "$REFRESH_SCRIPT"; then
  echo 'FAIL: W6 queue refresh must never contain provider dispatch code' >&2
  exit 1
fi
if grep -Eq 'writeFile|appendFile|\.env.*=' "$REFRESH_SCRIPT"; then
  echo 'FAIL: W6 queue refresh must not mutate environment files' >&2
  exit 1
fi

printf 'EngageOS Phase17 namespace-bound single-message canary policy: PASS\n'
printf 'EngageOS Phase17 W6 no-provider queue-refresh policy: PASS\n'
