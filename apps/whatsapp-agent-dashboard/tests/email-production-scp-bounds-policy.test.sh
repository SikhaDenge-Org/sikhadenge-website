#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKFLOWS="$ROOT/../../.github/workflows"

fail=0
while IFS= read -r file; do
  if grep -q 'scp ' "$file"; then
    if ! grep -q 'ConnectTimeout=10' "$file" || ! grep -q 'ConnectionAttempts=1' "$file"; then
      echo "FAIL: unbounded SCP evidence collection in $file" >&2
      fail=1
    fi
  fi
done < <(find "$WORKFLOWS" -maxdepth 1 -type f -name 'whatsapp-agent-email-*.yml' | sort)

test "$fail" = "0"
echo "PASS: all Email production SCP evidence collection is bounded"
