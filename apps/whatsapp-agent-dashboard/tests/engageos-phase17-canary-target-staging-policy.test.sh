#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/engageos-phase17-canary-target-staging.ts"

test -f "$SCRIPT"

grep -q 'type StageMode = "DRY_RUN" | "STAGE" | "CANCEL"' "$SCRIPT"
grep -q 'PHASE17_CANARY_TARGET_WA_ID' "$SCRIPT"
grep -q 'PHASE17_CANARY_CONVERSATION_ID' "$SCRIPT"
grep -q 'PHASE17_CANARY_TEXT' "$SCRIPT"
grep -q 'PHASE17_CANARY_APPROVER_USER_ID' "$SCRIPT"
grep -q 'PHASE17_CANARY_CONFIRMED_INTENT_HASH' "$SCRIPT"
grep -q 'phase17-single-message-canary-v1' "$SCRIPT"
grep -q 'PHASE17_SINGLE_MESSAGE' "$SCRIPT"
grep -q 'ONE_CONNECTED_ACCOUNT' "$SCRIPT"
grep -q 'SHADOW' "$SCRIPT"
grep -q 'NO_EXTERNAL_WRITES' "$SCRIPT"
grep -q 'getOutboundMode() === "live"' "$SCRIPT"
grep -q 'queueOutboundMessage' "$SCRIPT"
grep -q 'PHASE17_CANARY_STAGE_CANCELLED' "$SCRIPT"
grep -q 'Initial Phase17 TEXT canary requires an open WhatsApp service window.' "$SCRIPT"
grep -q 'externalWhatsAppWriteSent: false' "$SCRIPT"

if grep -q 'dispatchOutboundMessage' "$SCRIPT"; then
  echo 'FAIL: staging script must never directly dispatch a WhatsApp message' >&2
  exit 1
fi
if grep -q 'sendMetaWhatsAppMessage' "$SCRIPT"; then
  echo 'FAIL: staging script must never call the Meta provider directly' >&2
  exit 1
fi

printf 'Phase17 canary target staging policy: PASS\n'
