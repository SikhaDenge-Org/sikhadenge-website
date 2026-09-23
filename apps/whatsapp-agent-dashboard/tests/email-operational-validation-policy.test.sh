#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKFLOW="$ROOT/../../.github/workflows/whatsapp-agent-email-operational-validation.yml"

test -f "$WORKFLOW"

grep -q 'DEPLOYED_SHA=.*git -C.*rev-parse HEAD' "$WORKFLOW"
grep -q 'DISCOVERED_DEPLOYED_SHA=' "$WORKFLOW"
grep -q 'idempotencyKey:{startsWith:"internal-test-"}' "$WORKFLOW"
grep -q 'orderBy:{createdAt:"desc"}' "$WORKFLOW"
grep -q 'IDEMPOTENCY_REPLAYED=' "$WORKFLOW"
grep -q 'DUPLICATE_RECORD_COUNT=' "$WORKFLOW"
grep -q 'replay.replayed' "$WORKFLOW"
grep -q 'count!==1' "$WORKFLOW"

if grep -q 'github.event.before' "$WORKFLOW"; then
  echo "FAIL: operational validation must discover actual live SHA instead of assuming github.event.before is deployed" >&2
  exit 1
fi
if grep -Eq 'EXPECTED_DEPLOYED_SHA:[[:space:]]*[0-9a-f]{40}' "$WORKFLOW"; then
  echo "FAIL: operational validation must not hard-code a deployed SHA" >&2
  exit 1
fi
if grep -Eq 'MESSAGE_ID:[[:space:]]*cmu|IDEMPOTENCY_KEY:[[:space:]]*internal-test-' "$WORKFLOW"; then
  echo "FAIL: operational validation must not hard-code canary identifiers" >&2
  exit 1
fi

echo "PASS: email operational validation discovers live SHA and follows latest persisted canary"

# Governed operational validation marker; no runtime behavior change.
