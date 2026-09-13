#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT=scripts/engageos-phase17-stage2-promote.ts
test -f "$SCRIPT"

grep -Fq 'APPLY_ONE_CONNECTED_ACCOUNT_SHADOW' "$SCRIPT"
grep -Fq 'Stage2 promotion requires expected version 1.' "$SCRIPT"
grep -Fq 'candidate.status !== "CONNECTED"' "$SCRIPT"
grep -Fq 'targetStage: "ONE_CONNECTED_ACCOUNT"' "$SCRIPT"
grep -Fq 'targetMode: "SHADOW"' "$SCRIPT"
grep -Fq 'externalWritesRequested: false' "$SCRIPT"
grep -Fq 'externalWritesAllowed' "$SCRIPT"
grep -Fq 'transitionControlledLaunchState' "$SCRIPT"
grep -Fq 'PHASE17_STAGE2_MODE=DRY_RUN' "$SCRIPT"
grep -Fq 'PHASE17_STAGE2_STATE=ONE_CONNECTED_ACCOUNT|SHADOW|NO_EXTERNAL_WRITES|false|2' "$SCRIPT"
grep -Fq 'history.length !== 2' "$SCRIPT"

if grep -Eq 'repository\.transitionState\(|prisma\.\$executeRaw|prisma\.\$queryRaw.*UPDATE' "$SCRIPT"; then
  printf 'FAIL: Stage2 operator bypasses controlled launch application policy\n' >&2
  exit 1
fi

printf 'PASS: PHASE17_STAGE2_OPERATOR_POLICY_CONTRACT\n'
