#!/usr/bin/env bash
set -Eeuo pipefail

FILE="scripts/engageos-phase17-canary-evidence-observer.ts"
test -f "$FILE"

grep -q 'PHASE17_CANARY_EVIDENCE_MODE' "$FILE"
grep -q 'PHASE17_CANARY_EVIDENCE_MESSAGE_ID' "$FILE"
grep -q 'PHASE17_SINGLE_MESSAGE' "$FILE"
grep -q 'ONE_CONNECTED_ACCOUNT' "$FILE"
grep -q 'SHADOW' "$FILE"
grep -q 'NO_EXTERNAL_WRITES' "$FILE"
grep -q 'externalWritesRequested' "$FILE"
grep -q 'attemptCount !== 1' "$FILE"
grep -q 'metaAcceptedStatus' "$FILE"
grep -q 'sentEventPresent' "$FILE"
grep -q 'failureEventCount' "$FILE"
grep -q 'statusRegressionDetected' "$FILE"
grep -q 'duplicateIntentCount' "$FILE"
grep -q 'openApprovalCount' "$FILE"
grep -q 'consumedMatchingApprovalCount' "$FILE"
grep -q 'EngageControlledLaunchOutboundApproval' "$FILE"
grep -q 'mutationPerformed: false' "$FILE"
grep -q 'externalWhatsAppWriteSent: false' "$FILE"

if grep -q 'dispatchOutboundMessage' "$FILE"; then
  echo 'FAIL: evidence observer must not dispatch outbound messages' >&2
  exit 1
fi
if grep -q 'queueOutboundMessage' "$FILE"; then
  echo 'FAIL: evidence observer must not queue outbound messages' >&2
  exit 1
fi
if grep -q 'sendMetaWhatsAppMessage' "$FILE"; then
  echo 'FAIL: evidence observer must not call Meta provider send' >&2
  exit 1
fi

printf 'Phase17 canary evidence observer policy: PASS\n'
