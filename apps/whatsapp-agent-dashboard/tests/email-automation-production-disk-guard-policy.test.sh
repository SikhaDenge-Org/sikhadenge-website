#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKFLOW="$ROOT/../../.github/workflows/whatsapp-agent-production-batch1.yml"

test -f "$WORKFLOW"

grep -q "git worktree prune --expire now" "$WORKFLOW"
grep -q "sikhadenge-github-production-\*" "$WORKFLOW"
grep -q "npm cache clean --force" "$WORKFLOW"
grep -q "PRESTAGE_TMP_FREE_KB_AFTER_ORPHAN_CLEANUP" "$WORKFLOW"
grep -q "PRESTAGE_INSUFFICIENT_DISK_SPACE" "$WORKFLOW"
grep -q "required_kb=2097152" "$WORKFLOW"

if grep -Eq 'rm -rf[^\n]*(sikhadenge-backups|whatsapp-agent-dashboard/source|\.env|uploads|postgres|prisma)' "$WORKFLOW"; then
  echo "FAIL: production disk guard may delete protected production data" >&2
  exit 1
fi

echo "PASS: production staging disk guard policy"
