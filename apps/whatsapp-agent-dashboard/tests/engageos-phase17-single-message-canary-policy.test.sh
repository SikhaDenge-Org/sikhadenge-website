#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT="scripts/engageos-phase17-single-message-canary.ts"

test -f "$SCRIPT"

grep -Fq 'dispatchOutboundMessage(messageId)' "$SCRIPT"
if grep -Fq 'dispatchQueuedOutboundBatch' "$SCRIPT"; then
  echo 'FAIL: canary executor must never use batch dispatch' >&2
  exit 1
fi

grep -Fq 'message.type !== MessageType.TEXT' "$SCRIPT"
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

printf 'EngageOS Phase17 single-message canary policy: PASS\n'
