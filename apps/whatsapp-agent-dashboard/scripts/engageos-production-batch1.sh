#!/usr/bin/env bash
# Production rollout marker: Phase17 exact-SHA machine evidence paired trigger - 2026-09-15
# Production rollout marker: Phase17 final Stage2 machine-evidence lock — 2026-09-15
# Production rollout marker: Page 01 V11 exact-fit local hero — 2026-09-13
# Production rollout marker: Page 01 V10 stable-head retry — 2026-09-13
# Production rollout marker: Page 01 canonical HQ V9 single-logo release — 2026-09-13
# Production rollout marker: Phase17 Stage1 persisted SHADOW activation — 2026-09-13
# Production rollout marker: validated inline Page 01 hero + canonical SikhaDenge logo — 2026-09-13
# Production rollout marker: Phase16E migration-lineage compatibility gate — 2026-09-13
# Production rollout marker: intentional preflight failure capture hardened — 2026-09-13
# Production rollout marker: Page 01 inline WebP hero live fix — 2026-09-12
# Production rollout marker: Page 01 hero asset delivery + cache-bust diagnostic — 2026-09-12
# Production rollout marker: Page 01 bundled LEFT hero asset hotfix — 2026-09-12
# Production rollout marker: Page 01 generated LEFT visual + genuine SikhaDenge logo overlay; RIGHT auth unchanged — 2026-09-12
# Production rollout marker: Page 01 code-native DOM/CSS/SVG + real SikhaDenge asset — 2026-09-12
# Production rollout marker: Page 01 approved reference exact visual — 2026-09-12
# Production rollout marker: Page 01 approved split-screen responsive UI — 2026-09-12
# Production rollout marker: Page 01 original SikhaDenge logo + responsive exact reference deploy — 2026-09-12
# Production rollout marker: Page 01 pixel-reference exact live — 2026-09-12
# Retry marker: dedicated GitHub Actions SSH port 2222 configured on 2026-08-03
# CI marker: validate canonical pinned host entry workflow fix on 2026-08-03
# Retry marker: keep release branch stable during production execution on 2026-08-03
# Production rollout marker: validated EngageOS + Enterprise UI release on 2026-09-10
# Production rollout marker: final UI/UX audit closure deploy on 2026-09-11
set -Eeuo pipefail

: "${LIVE_APP:?LIVE_APP is required}"
: "${STAGE_APP:?STAGE_APP is required}"
: "${RELEASE_SHA:?RELEASE_SHA is required}"
: "${RUN_ID:?RUN_ID is required}"

PM2_PROCESS_NAME="${PM2_PROCESS_NAME:-sikhadenge-whatsapp-agent}"
PUBLIC_URL="${PUBLIC_URL:-https://whatsapp.sikhadenge.in}"
BACKUP_ROOT="${BACKUP_ROOT:-/root/sikhadenge-backups}"
BACKUP_DIR="${BACKUP_ROOT}/engageos-${RUN_ID}"
ENV_FILE="${ENV_FILE:-${LIVE_APP}/.env}"
DYNAMIC_LINEAGE_COMPAT=false

export LIVE_APP STAGE_APP RELEASE_SHA RUN_ID PM2_PROCESS_NAME PUBLIC_URL
export BACKUP_ROOT BACKUP_DIR ENV_FILE

rollback_on_error() {
  local exit_code=$?
  trap - ERR
  printf 'FAIL: PRODUCTION_BATCH_1_FAILED code=%s\n' "$exit_code" >&2
  if [[ -f "$BACKUP_DIR/deploy-state.txt" ]]; then
    printf 'INFO: activation state exists; starting automatic application rollback\n' >&2
    if bash "$STAGE_APP/scripts/engageos-production-rollback.sh"; then
      printf 'PASS: AUTOMATIC_ROLLBACK_COMPLETED\n' >&2
    else
      printf 'CRITICAL: AUTOMATIC_ROLLBACK_FAILED\n' >&2
    fi
  else
    printf 'INFO: activation did not begin; application rollback not required\n' >&2
  fi
  exit "$exit_code"
}
trap rollback_on_error ERR

probe_asset() {
  local path="$1"
  local label="$2"
  local min_bytes="$3"
  local expected_type="$4"
  local probe_file headers_file http_status byte_count content_type
  probe_file="$(mktemp)"
  headers_file="$(mktemp)"
  http_status="$(curl -sS -L -D "$headers_file" -o "$probe_file" -w '%{http_code}' "${PUBLIC_URL}${path}?probe=${RUN_ID}-${label}")"
  byte_count="$(wc -c < "$probe_file" | tr -d ' ')"
  content_type="$(awk 'BEGIN{IGNORECASE=1} /^content-type:/ {gsub("\r", ""); sub(/^[^:]*:[[:space:]]*/, ""); value=$0} END{print value}' "$headers_file")"
  printf '%s_HTTP=%s\n' "$label" "$http_status"
  printf '%s_BYTES=%s\n' "$label" "$byte_count"
  printf '%s_CONTENT_TYPE=%s\n' "$label" "$content_type"
  test "$http_status" = "200"
  test "$byte_count" -ge "$min_bytes"
  case "$content_type" in "$expected_type"*) ;; *) printf 'FAIL: %s unexpected content type: %s\n' "$label" "$content_type" >&2; rm -f "$probe_file" "$headers_file"; return 1 ;; esac
  rm -f "$probe_file" "$headers_file"
}

probe_login_hq() {
  local probe_file http_status
  probe_file="$(mktemp)"

  http_status="$(
    curl -sS -L \
      -o "$probe_file" \
      -w '%{http_code}' \
      "${PUBLIC_URL}/login?hq-v9-probe=${RUN_ID}"
  )"

  printf 'PAGE01_LOGIN_HQ_V9_HTTP=%s\n' \
    "$http_status"

  test "$http_status" = "200"

  rm -f "$probe_file"

  printf 'PASS: PAGE01_HQ_V9_LOGIN_PUBLICLY_RENDERED\n'
}

run_readonly_preflight() {
  local preflight_log preflight_code failure_count
  preflight_log="$(mktemp)"

  # The legacy preflight has a fixed migration allowlist. A non-zero result is
  # tolerated only when its sole failure is that fixed allowlist; the target
  # release is then independently checked against the dynamic committed lineage.
  trap - ERR
  set +e
  EXPECTED_RELEASE_SHA="$RELEASE_SHA" \
    ENV_FILE="$ENV_FILE" \
    PM2_PROCESS_NAME="$PM2_PROCESS_NAME" \
    CHECK_HTTP_URL="$PUBLIC_URL" \
    VERIFY_PG_DUMP=1 \
    bash "$STAGE_APP/scripts/engageos-production-preflight.sh" >"$preflight_log" 2>&1
  preflight_code=$?
  set -e
  trap rollback_on_error ERR

  cat "$preflight_log"

  if [[ "$preflight_code" == "0" ]]; then
    rm -f "$preflight_log"
    printf 'PASS: STANDARD_PREFLIGHT_COMPLETE\n'
    return 0
  fi

  failure_count="$(grep -c '^FAIL:' "$preflight_log" || true)"
  if [[ "$failure_count" == "1" ]] \
    && grep -Fxq 'FAIL: Prisma history contains unrecognized migrations' "$preflight_log"; then
    ENV_FILE="$ENV_FILE" \
      STAGE_APP="$STAGE_APP" \
      bash "$STAGE_APP/scripts/engageos-production-dynamic-lineage-readonly.sh"
    DYNAMIC_LINEAGE_COMPAT=true
    rm -f "$preflight_log"
    printf 'PASS: PREFLIGHT_DYNAMIC_LINEAGE_COMPATIBILITY_VERIFIED\n'
    return 0
  fi

  rm -f "$preflight_log"
  printf 'FAIL: READ_ONLY_PREFLIGHT_REJECTED code=%s failures=%s\n' "$preflight_code" "$failure_count" >&2
  return "$preflight_code"
}

printf 'ENGAGEOS_PRODUCTION_BATCH_1_BEGIN\n'
printf 'RUN_ID=%s\n' "$RUN_ID"
printf 'RELEASE_SHA=%s\n' "$RELEASE_SHA"
printf 'STARTED_UTC=%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

test "$(git -C "$STAGE_APP" rev-parse HEAD)" = "$RELEASE_SHA"
test -z "$(git -C "$LIVE_APP" status --porcelain --untracked-files=no)"
git -C "$LIVE_APP" merge-base --is-ancestor "$(git -C "$LIVE_APP" rev-parse HEAD)" "$RELEASE_SHA"

printf '===== GATE: READ-ONLY PREFLIGHT =====\n'
run_readonly_preflight

printf '===== GATE: HIGH-RISK FLAGS FAIL-CLOSED =====\n'
ENV_FILE="$ENV_FILE" bash "$STAGE_APP/scripts/engageos-production-high-risk-flag-gate.sh"

printf '===== TASK 1/5: VERIFIED DATABASE BACKUP =====\n'
bash "$STAGE_APP/scripts/engageos-production-backup.sh"
test -s "$BACKUP_DIR/database.dump"
test -s "$BACKUP_DIR/database.dump.sha256"
sha256sum --check "$BACKUP_DIR/database.dump.sha256"

printf '===== TASK 2/5: GUARDED MIGRATION LINEAGE =====\n'
if [[ "$DYNAMIC_LINEAGE_COMPAT" == "true" ]]; then
  printf 'PASS: LEGACY_PREFLIGHT_LINEAGE_RECONCILED_WITH_TARGET_RELEASE\n'
fi
bash "$STAGE_APP/scripts/engageos-production-migrate-v2.sh"

printf '===== TASK 3/5: ISOLATED BUILD AND ATOMIC ACTIVATION =====\n'
bash "$STAGE_APP/scripts/engageos-production-build-deploy.sh"

printf '===== PAGE 01 VALIDATED PUBLIC PROBES =====\n'
probe_asset '/sikhadenge-header-safe-320.png' PAGE01_CANONICAL_LOGO 1000 image/png
probe_asset '/page01-left-hq-v9.png' PAGE01_HQ_V9_HERO 1000000 image/png
probe_asset '/page01-left-hq-v11.png' PAGE01_HQ_V11_HERO 1000000 image/png
probe_login_hq

printf '===== TASK 4/5: POST-DEPLOY VERIFICATION =====\n'
bash "$STAGE_APP/scripts/engageos-production-verify.sh"

printf '===== TASK 5/5: ROLLBACK READINESS EVIDENCE =====\n'
test -f "$BACKUP_DIR/deploy-state.txt"
test -d "$(awk -F= '$1 == "OLD_NEXT" {sub($1 "=", ""); print; exit}' "$BACKUP_DIR/deploy-state.txt")"
test -f "$BACKUP_DIR/source-before.sha"
test -f "$BACKUP_DIR/build-before.id"
printf 'PASS: ROLLBACK_ARTIFACTS_PRESERVED\n'

# The application is now independently verified. Controlled-launch persistence is
# additive database state and automatic application rollback would not undo it, so
# failures from this point fail closed without creating a misleading app/DB split.
trap - ERR

printf '===== PHASE17: STAGE-AWARE POST-DEPLOY CONTROLLED-LAUNCH GATE =====\n'
LIVE_APP="$LIVE_APP" \
STAGE_APP="$STAGE_APP" \
RELEASE_SHA="$RELEASE_SHA" \
BACKUP_DIR="$BACKUP_DIR" \
ENV_FILE="$ENV_FILE" \
PUBLIC_URL="$PUBLIC_URL" \
PHASE17_WORKSPACE_ID=engagews_default \
  bash "$STAGE_APP/scripts/engageos-production-phase17-postdeploy-gate.sh"

cat > "$BACKUP_DIR/batch-result.txt" <<EOF
RUN_ID=$RUN_ID
RELEASE_SHA=$RELEASE_SHA
STATUS=PASS
BACKUP_MANIFEST=$BACKUP_DIR/manifest.txt
MIGRATION_EVIDENCE=$BACKUP_DIR/migration-evidence.txt
POST_DEPLOY_EVIDENCE=$BACKUP_DIR/post-deploy-evidence.txt
PHASE17_POSTDEPLOY_EVIDENCE=$BACKUP_DIR/phase17-postdeploy-evidence.txt
COMPLETED_UTC=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
EOF
chmod 600 "$BACKUP_DIR/batch-result.txt"
cat "$BACKUP_DIR/batch-result.txt"
printf 'PASS: ENGAGEOS_PRODUCTION_BATCH_1_COMPLETE\n'
printf 'ENGAGEOS_PRODUCTION_BATCH_1_END\n'