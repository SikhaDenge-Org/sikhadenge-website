#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKFLOW="$ROOT/../../.github/workflows/whatsapp-agent-production-batch1.yml"

test -f "$WORKFLOW"

grep -q "git worktree prune --expire now" "$WORKFLOW"
grep -q "sikhadenge-github-production-\*" "$WORKFLOW"
grep -q "npm cache clean --force" "$WORKFLOW"
grep -q "PRESTAGE_TMP_FREE_KB_AFTER_ORPHAN_CLEANUP" "$WORKFLOW"
grep -q "PRESTAGE_LOW_SPACE_PRUNING_OBSOLETE_BUILD_SNAPSHOTS" "$WORKFLOW"
grep -q "PRESTAGE_RUNTIME_APP" "$WORKFLOW"
grep -q "pm2 jlist" "$WORKFLOW"
grep -q "sikhadenge-whatsapp-agent" "$WORKFLOW"
grep -q 'python3 - "$LIVE_APP" "$RUNTIME_APP"' "$WORKFLOW"
grep -q "PRESTAGE_OBSOLETE_BUILD_SNAPSHOTS_REMOVED" "$WORKFLOW"
grep -q "PRESTAGE_TMP_FREE_KB_AFTER_BUILD_SNAPSHOT_CLEANUP" "$WORKFLOW"
grep -q '\.next-before-engageos-\*' "$WORKFLOW"
grep -q '\.next-failed-engageos-\*' "$WORKFLOW"
grep -q '\.next-stage-engageos-\*' "$WORKFLOW"
grep -q 'retention = {' "$WORKFLOW"
grep -q '"\.next-before-engageos-\*": 2' "$WORKFLOW"
grep -q '"\.next-failed-engageos-\*": 1' "$WORKFLOW"
grep -q '"\.next-stage-engageos-\*": 0' "$WORKFLOW"
grep -q "PRESTAGE_INSUFFICIENT_DISK_SPACE" "$WORKFLOW"
grep -q "required_kb=2097152" "$WORKFLOW"

if grep -Eq 'rm -rf[^\n]*(sikhadenge-backups|whatsapp-agent-dashboard/source|\.env|uploads|postgres|prisma)' "$WORKFLOW"; then
  echo "FAIL: production disk guard may delete protected production data" >&2
  exit 1
fi

echo "PASS: production staging disk guard policy"
