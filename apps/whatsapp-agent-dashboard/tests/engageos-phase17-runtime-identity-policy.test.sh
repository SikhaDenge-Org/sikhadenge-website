#!/usr/bin/env bash
set -Eeuo pipefail

script_path="scripts/engageos-phase17-runtime-identity-readonly.sh"
runbook_path="docs/engageos/PHASE_17_STAGE2_SUPPORT_RUNBOOK.md"

test -f "$script_path"
test -f "$runbook_path"
bash -n "$script_path"

forbidden_patterns=(
  'pm2[[:space:]]+(restart|reload|stop|delete|kill|start)'
  'git[[:space:]]+(reset|checkout|switch|pull|merge|rebase|clean|commit|push)'
  '(^|[[:space:]])(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)[[:space:]]'
  'curl[^\n]*(-X|--request)[[:space:]]*(POST|PUT|PATCH|DELETE)'
  'prisma[[:space:]]+migrate[[:space:]]+(deploy|resolve|dev)'
  '(^|[[:space:]])(cp|mv|rm)[[:space:]]'
)

for pattern in "${forbidden_patterns[@]}"; do
  if grep -EIn "$pattern" "$script_path"; then
    printf 'Forbidden Phase17 runtime-identity mutation pattern detected: %s\n' "$pattern" >&2
    exit 1
  fi
done

grep -Fq 'RUNTIME_IDENTITY_MODE=canonical-source' "$script_path"
grep -Fq 'RUNTIME_IDENTITY_MODE=separate-build-mirror' "$script_path"
grep -Fq 'canonical-source runtime Git SHA matches expected release SHA' "$script_path"
grep -Fq 'PM2 runtime build ID matches canonical source build ID' "$script_path"
grep -Fq 'separate-build-mirror requires a verified deploy-state file' "$script_path"
grep -Fq 'DEPLOY_RELEASE_SHA=' "$script_path"
grep -Fq 'DEPLOY_NEW_BUILD_ID=' "$script_path"
grep -Fq 'DEPLOY_RUNTIME_APP=' "$script_path"
grep -Fq 'deploy-state release SHA matches expected release SHA' "$script_path"
grep -Fq 'deploy-state build ID matches canonical source and PM2 runtime build IDs' "$script_path"
grep -Fq 'deploy-state runtime path matches PM2 runtime path' "$script_path"
grep -Fq 'PHASE17_RUNTIME_IDENTITY=PASS' "$script_path"
grep -Fq 'PHASE17_RUNTIME_IDENTITY=FAIL' "$script_path"

grep -Fq 'runtime identity is not defined by PM2 runtime Git SHA alone' "$runbook_path"
grep -Fq "A separate mirror's old Git SHA is diagnostic metadata" "$runbook_path"
grep -Fq 'matching build IDs without exact deploy-state release provenance is also insufficient' "$runbook_path"
grep -Fq 'Do not infer the deploy-state path from recency alone' "$runbook_path"
grep -Fq 'engageos-phase17-runtime-identity-readonly.sh' "$runbook_path"
grep -Fq 'separate PM2 build-mirror identity, when present, is verified with build ID plus exact deploy-state provenance' "$runbook_path"

printf 'EngageOS Phase17 runtime identity policy test passed.\n'
