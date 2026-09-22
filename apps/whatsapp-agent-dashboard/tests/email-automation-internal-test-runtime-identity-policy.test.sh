#!/usr/bin/env bash
set -Eeuo pipefail

workflow="../../.github/workflows/whatsapp-agent-email-internal-test.yml"

test -f "$workflow"

required=(
  'REQUESTED_DEPLOYED_SHA'
  'DEPLOYED_SHA="$(git rev-parse HEAD)"'
  'CERTIFIED_RELEASE_SHA'
  'CERTIFIED_BUILD_ID'
  'CERTIFIED_PM2_STATUS'
  'CERTIFIED_PM2_CWD'
  'LIVE_PM2_STATUS'
  'EMAIL_INTERNAL_TEST_RECIPIENT="ankitsingh@sikhadenge.in"'
  'EMAIL_INTERNAL_TEST_SENDER="support@sikhadenge.in"'
)

for marker in "${required[@]}"; do
  grep -Fq "$marker" "$workflow" || {
    echo "Missing internal-test runtime identity contract: $marker" >&2
    exit 1
  }
done

if grep -Fq 'github.event.before' "$workflow"; then
  echo "Internal Email test must not infer production runtime identity from github.event.before." >&2
  exit 1
fi

echo "Email internal-test live runtime identity policy: PASS"
