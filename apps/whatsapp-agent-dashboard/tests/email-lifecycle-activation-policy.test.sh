#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/email-lifecycle-activate.ts"
WORKFLOW="$ROOT/../../.github/workflows/whatsapp-agent-email-lifecycle-activate.yml"

test -f "$SCRIPT"
test -f "$WORKFLOW"

grep -q "\\[email-lifecycle-activate\\]" "$WORKFLOW"
grep -q 'DEPLOYED_SHA:.*github.event.before' "$WORKFLOW"
grep -q 'EMAIL_RUNTIME_MODE' "$WORKFLOW"
grep -q 'EMAIL_EXTERNAL_WRITES_ENABLED' "$WORKFLOW"
grep -q 'test "$(git rev-parse HEAD)" = "$DEPLOYED_SHA"' "$WORKFLOW"
grep -q 'StrictHostKeyChecking=yes' "$WORKFLOW"
grep -q 'ConnectTimeout=10' "$WORKFLOW"
grep -q 'ConnectionAttempts=1' "$WORKFLOW"
grep -q 'setAutomationFlowStatus' "$SCRIPT"
grep -q 'status: "ACTIVE"' "$SCRIPT"
grep -q 'externalRequestSent: false' "$SCRIPT"
grep -q 'support@sikhadenge.in' "$SCRIPT"
grep -q 'unsubscribe_url' "$SCRIPT"
grep -q 'EMAIL_LIFECYCLE_ACTIVATION=PASS' "$SCRIPT"
grep -q 'activeFlows' "$SCRIPT"
grep -q 'runtimeMode !== "DRY_RUN"' "$SCRIPT"
grep -q 'externalWritesEnabled' "$SCRIPT"

echo "PASS: email lifecycle activation policy"
