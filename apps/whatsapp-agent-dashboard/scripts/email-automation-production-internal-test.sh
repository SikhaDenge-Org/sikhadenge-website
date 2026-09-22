#!/usr/bin/env bash
set -Eeuo pipefail
APPLY="${APPLY:-0}"
LIVE_APP="${LIVE_APP:-$(pwd)}"
ENV_FILE="${ENV_FILE:-$LIVE_APP/.env}"
PM2_PROCESS_NAME="${PM2_PROCESS_NAME:-sikhadenge-whatsapp-agent}"
SERVICE_NAME="${SERVICE_NAME:-sikhadenge-email-automation-scheduler}"
EXPECTED_RELEASE_SHA="${EXPECTED_RELEASE_SHA:-}"
RUN_ID="${RUN_ID:-email-internal-$(date -u +%Y%m%dT%H%M%SZ)}"
BACKUP_ROOT="${BACKUP_ROOT:-/root/sikhadenge-backups}"
BACKUP_DIR="$BACKUP_ROOT/$RUN_ID"
RECIPIENT="${EMAIL_INTERNAL_TEST_RECIPIENT:-ankitsingh@sikhadenge.in}"
SENDER="${EMAIL_INTERNAL_TEST_SENDER:-support@sikhadenge.in}"
fail(){ printf 'FAIL: %s\n' "$*" >&2; exit 1; }

[[ -n "$EXPECTED_RELEASE_SHA" ]] || fail "EXPECTED_RELEASE_SHA is required"
[[ -f "$ENV_FILE" ]] || fail "ENV_FILE not found"
cd "$LIVE_APP"
[[ "$(git rev-parse HEAD 2>/dev/null || true)" == "$EXPECTED_RELEASE_SHA" ]] || fail "git SHA mismatch"

# The internal-send window may only begin from the production-safe baseline.
set -a
source "$ENV_FILE"
set +a
[[ "${EMAIL_RUNTIME_ENABLED:-false}" == "true" ]] || fail "pre-test email runtime must be enabled"
[[ "${EMAIL_AUTOMATION_ENABLED:-false}" == "true" ]] || fail "pre-test email automation must be enabled"
[[ "${EMAIL_RUNTIME_MODE:-}" == "DRY_RUN" ]] || fail "pre-test runtime mode must be DRY_RUN"
[[ "${EMAIL_EXTERNAL_WRITES_ENABLED:-false}" == "false" ]] || fail "pre-test external writes must be disabled"
systemctl is-enabled "${SERVICE_NAME}.timer" >/dev/null 2>&1 || fail "pre-test scheduler timer must be enabled"
systemctl is-active "${SERVICE_NAME}.timer" >/dev/null 2>&1 || fail "pre-test scheduler timer must be active"

printf 'EMAIL_INTERNAL_TEST_PLAN\nAPPLY=%s\nRUNTIME_MODE=INTERNAL_RECIPIENTS\nRECIPIENT=%s\nSENDER=%s\nAUTOMATION_ENABLED=false\nPOST_TEST_MODE=DRY_RUN\n' "$APPLY" "$RECIPIENT" "$SENDER"
[[ "$APPLY" == "1" ]] || { printf 'INFO: preview only\n'; exit 0; }
[[ "$(id -u)" == "0" ]] || fail "APPLY=1 requires root"

install -d -m 700 "$BACKUP_DIR"
cp -a "$ENV_FILE" "$BACKUP_DIR/.env.before"
chmod 600 "$BACKUP_DIR/.env.before"
restored=0

restore(){
  original_code=$?
  trap - ERR EXIT
  set +e
  restore_failures=0

  if [[ "$restored" != "1" ]]; then
    APPLY=1 SERVICE_NAME="$SERVICE_NAME" bash scripts/email-automation-scheduler-deactivate.sh >"$BACKUP_DIR/restore-scheduler-deactivate.log" 2>&1
    [[ $? -eq 0 ]] || restore_failures=$((restore_failures+1))

    cp -a "$BACKUP_DIR/.env.before" "$ENV_FILE"
    [[ $? -eq 0 ]] || restore_failures=$((restore_failures+1))

    pm2 restart "$PM2_PROCESS_NAME" --update-env >"$BACKUP_DIR/restore-pm2.log" 2>&1
    [[ $? -eq 0 ]] || restore_failures=$((restore_failures+1))
    sleep 3

    APPLY=1 EXPECTED_RELEASE_SHA="$EXPECTED_RELEASE_SHA" APP_DIR="$LIVE_APP" ENV_FILE="$ENV_FILE" SERVICE_NAME="$SERVICE_NAME" \
      bash scripts/email-automation-scheduler-activate.sh >"$BACKUP_DIR/restore-scheduler-activate.log" 2>&1
    [[ $? -eq 0 ]] || restore_failures=$((restore_failures+1))

    EXPECTED_RELEASE_SHA="$EXPECTED_RELEASE_SHA" ENV_FILE="$ENV_FILE" SERVICE_NAME="$SERVICE_NAME" MAX_FAILED_EVENTS=0 \
      bash scripts/email-automation-scheduler-verify.sh >"$BACKUP_DIR/restore-scheduler-verify.log" 2>&1
    [[ $? -eq 0 ]] || restore_failures=$((restore_failures+1))

    set -a
    source "$ENV_FILE"
    source_code=$?
    set +a
    [[ $source_code -eq 0 ]] || restore_failures=$((restore_failures+1))
    [[ "${EMAIL_RUNTIME_ENABLED:-false}" == "true" ]] || restore_failures=$((restore_failures+1))
    [[ "${EMAIL_AUTOMATION_ENABLED:-false}" == "true" ]] || restore_failures=$((restore_failures+1))
    [[ "${EMAIL_RUNTIME_MODE:-}" == "DRY_RUN" ]] || restore_failures=$((restore_failures+1))
    [[ "${EMAIL_EXTERNAL_WRITES_ENABLED:-false}" == "false" ]] || restore_failures=$((restore_failures+1))
    systemctl is-enabled "${SERVICE_NAME}.timer" >/dev/null 2>&1 || restore_failures=$((restore_failures+1))
    systemctl is-active "${SERVICE_NAME}.timer" >/dev/null 2>&1 || restore_failures=$((restore_failures+1))
    restored=1
  fi

  final_code="$original_code"
  if (( restore_failures > 0 )); then
    final_code=70
  fi

  if [[ "$final_code" == "0" ]]; then
    {
      printf 'STATUS=PASS_POST_TEST_DRY_RUN_RESTORED\n'
      printf 'POST_TEST_RUNTIME_MODE=DRY_RUN\n'
      printf 'POST_TEST_EXTERNAL_WRITES=false\n'
      printf 'POST_TEST_SCHEDULER_ENABLED=true\n'
      printf 'POST_TEST_SCHEDULER_ACTIVE=true\n'
    } > "$BACKUP_DIR/internal-test-result.txt"
    printf 'POST_TEST_RUNTIME_MODE=DRY_RUN\nPOST_TEST_EXTERNAL_WRITES=false\nPOST_TEST_SCHEDULER_ENABLED=true\nPOST_TEST_SCHEDULER_ACTIVE=true\n'
  else
    {
      printf 'STATUS=FAILED_POST_TEST_RESTORE\n'
      printf 'ORIGINAL_EXIT_CODE=%s\n' "$original_code"
      printf 'RESTORE_FAILURES=%s\n' "$restore_failures"
      printf 'FINAL_EXIT_CODE=%s\n' "$final_code"
    } > "$BACKUP_DIR/internal-test-result.txt"
    printf 'FAIL: post-test restore failed original=%s restore_failures=%s final=%s\n' "$original_code" "$restore_failures" "$final_code" >&2
  fi

  chmod 600 "$BACKUP_DIR"/* 2>/dev/null || true
  exit "$final_code"
}

trap restore ERR EXIT

APPLY=1 SERVICE_NAME="$SERVICE_NAME" bash scripts/email-automation-scheduler-deactivate.sh >/dev/null
node - "$ENV_FILE" "$RECIPIENT" <<'NODE'
const fs=require('node:fs'),path=require('node:path');
const file=process.argv[2],recipient=process.argv[3].trim().toLowerCase(); const original=fs.readFileSync(file,'utf8'), stat=fs.statSync(file);
const desired={EMAIL_RUNTIME_ENABLED:'true',EMAIL_AUTOMATION_ENABLED:'false',EMAIL_RUNTIME_MODE:'INTERNAL_RECIPIENTS',EMAIL_EXTERNAL_WRITES_ENABLED:'true',EMAIL_INTERNAL_RECIPIENT_ALLOWLIST:recipient,EMAIL_INBOUND_SYNC_ENABLED:'false'};
const keys=new Set(Object.keys(desired)); const kept=original.split(/\r?\n/).filter(raw=>{const line=raw.trim();if(!line||line.startsWith('#'))return true;const n=line.startsWith('export ')?line.slice(7).trim():line;const i=n.indexOf('=');return i<1||!keys.has(n.slice(0,i).trim());}); while(kept.length&&kept.at(-1)==='')kept.pop(); for(const [k,v] of Object.entries(desired))kept.push(`${k}=${v}`);kept.push(''); const tmp=path.join(path.dirname(file),`.${path.basename(file)}.${process.pid}.tmp`);fs.writeFileSync(tmp,kept.join('\n'),{mode:stat.mode});fs.chmodSync(tmp,stat.mode);try{fs.chownSync(tmp,stat.uid,stat.gid)}catch{}fs.renameSync(tmp,file);
NODE
pm2 restart "$PM2_PROCESS_NAME" --update-env >/dev/null
sleep 3
set -a
source "$ENV_FILE"
set +a
export EMAIL_INTERNAL_TEST_RECIPIENT="$RECIPIENT" EMAIL_INTERNAL_TEST_SENDER="$SENDER" EMAIL_INTERNAL_TEST_IDEMPOTENCY_KEY="internal-test-${RUN_ID}"
npm exec -- tsx scripts/email-automation-internal-test-send.ts | tee "$BACKUP_DIR/send.log"
grep -q '^EMAIL_INTERNAL_TEST_STATUS=SENT$' "$BACKUP_DIR/send.log"
grep -q '^EMAIL_INTERNAL_TEST_EXTERNAL_REQUEST_SENT=true$' "$BACKUP_DIR/send.log"
restore
