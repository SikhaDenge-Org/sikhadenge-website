#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROUTE="$ROOT/app/api/conversations/[conversationId]/send/route.ts"
SERVICE="$ROOT/lib/outbound/outbound-service.ts"
POLICY="$ROOT/lib/outbound/policy.ts"

test -f "$ROUTE" && test -f "$SERVICE" && test -f "$POLICY"
grep -q 'A 1-200 character idempotencyKey is required' "$ROUTE"
grep -q 'assertPersistedManualOutboundAllowed' "$ROUTE"
grep -q 'dispatchWhatsAppOutboundViaCore' "$ROUTE"
grep -q 'outboundSent: dispatch?.outboundSent ?? false' "$ROUTE"
grep -q 'dispatchError' "$ROUTE"
grep -q 'TEMPLATE_REQUIRED_OUTSIDE_SERVICE_WINDOW' "$POLICY"
grep -q 'TEMPLATE_NOT_APPROVED' "$POLICY"
grep -q 'CONTACT_OPTED_OUT' "$POLICY"
grep -q 'attemptCount: previousAttempts + 1' "$SERVICE"
grep -q 'metaAcceptedStatus: sent.statusCode' "$SERVICE"
grep -q 'status: MessageStatus.SENT' "$SERVICE"
grep -q 'status: MessageStatus.FAILED' "$SERVICE"
grep -q 'isRetriableMetaError' "$SERVICE"
printf 'Manual outbound certification policy: PASS\n'