#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/email-lifecycle-readiness.ts"

test -f "$SCRIPT"

grep -q 'const flowPinsValid = flowChecks.every((check) => check.approvedCurrentVersion' "$SCRIPT"
if grep -q 'flowPinsValid = flowChecks.every((check) => check.flowDraft' "$SCRIPT"; then
  echo "FAIL: flowPinsValid must not depend on DRAFT lifecycle state" >&2
  exit 1
fi

grep -q 'draftFlows === EXPECTED && flowPinsValid' "$SCRIPT"
grep -q 'if (draftFlows !== EXPECTED) blockers.push("lifecycle_flows_not_all_draft")' "$SCRIPT"
grep -q 'if (!flowPinsValid) blockers.push("lifecycle_flow_pins_invalid")' "$SCRIPT"

echo "PASS: lifecycle readiness separates activation state from pin validity"
