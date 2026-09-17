#!/usr/bin/env bash
set -Eeuo pipefail

script_path="scripts/engageos-phase17-production-readiness.sh"
normalizer_path="scripts/prisma-postgres-cli-url.mjs"
runtime_identity_test="tests/engageos-phase17-runtime-identity-policy.test.sh"

test -f "$script_path"
test -f "$normalizer_path"
test -f "$runtime_identity_test"
bash -n "$script_path"
node --check "$normalizer_path"

forbidden_patterns=(
  'prisma[[:space:]]+migrate[[:space:]]+deploy'
  'prisma[[:space:]]+migrate[[:space:]]+resolve'
  'pm2[[:space:]]+(restart|reload|stop|delete|kill|start)'
  'git[[:space:]]+(reset|checkout|switch|pull|merge|rebase|clean|commit|push)'
  '(^|[[:space:]])(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)[[:space:]]'
  'curl[^\n]*(-X|--request)[[:space:]]*(POST|PUT|PATCH|DELETE)'
  'source[[:space:]]+.*ENV_FILE'
  '(^|[[:space:]])\.[[:space:]]+.*ENV_FILE'
  '(^|[[:space:]])(cat|printf|echo)[[:space:]].*DATABASE_URL'
)

for pattern in "${forbidden_patterns[@]}"; do
  if grep -EIn "$pattern" "$script_path"; then
    printf 'Forbidden Phase17 production-readiness pattern detected: %s\n' "$pattern" >&2
    exit 1
  fi
done

grep -Fq 'TARGET_ROLLOUT_STAGE=INTERNAL_TEST_IDENTITIES' "$script_path"
grep -Fq 'TARGET_ROLLOUT_MODE=SHADOW' "$script_path"
grep -Fq 'EXTERNAL_WRITES_ALLOWED=false' "$script_path"
grep -Fq 'EXPECTED_RELEASE_SHA is required' "$script_path"
grep -Fq 'Git HEAD matches expected release SHA' "$script_path"
grep -Fq 'git status --porcelain --untracked-files=no' "$script_path"
grep -Fq 'Git tracked worktree is clean' "$script_path"
grep -Fq 'Git tracked worktree has changes' "$script_path"
grep -Fq 'find prisma/migrations' "$script_path"
grep -Fq 'PENDING_REPO_MIGRATION_COUNT=' "$script_path"
grep -Fq 'UNKNOWN_APPLIED_MIGRATION_COUNT=' "$script_path"
grep -Fq '20260723160037_init_whatsapp_agent' "$script_path"
grep -Fq 'EngageOutboundWebhookEndpoint' "$script_path"
grep -Fq 'initializationVector' "$script_path"
grep -Fq 'authenticationTag' "$script_path"
grep -Fq 'ciphertext' "$script_path"
grep -Fq 'PHASE16E_WEBHOOK_REQUIRED_ENCRYPTED_COLUMN_COUNT=' "$script_path"
grep -Fq 'PHASE16E_WEBHOOK_PLAINTEXT_SECRET_COLUMN_COUNT=' "$script_path"
grep -Fq 'initial SHADOW safety flags exist and remain disabled' "$script_path"
grep -Fq 'pm2 describe' "$script_path"
grep -Fq '/login' "$script_path"
grep -Fq 'PHASE17_STAGE1_READINESS=PASS' "$script_path"
grep -Fq 'PHASE17_STAGE1_READINESS=FAIL' "$script_path"

bash "$runtime_identity_test"

printf 'EngageOS Phase17 production readiness policy test passed.\n'
