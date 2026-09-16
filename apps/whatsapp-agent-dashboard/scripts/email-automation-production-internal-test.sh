#!/usr/bin/env bash
set -Eeuo pipefail
APPLY="${APPLY:-0}"
LIVE_APP="${LIVE_APP:-$(pwd)}"
ENV_FILE="${ENV_FILE:-$LIVE_APP/.env}"
PM2_PROCESS_NAME="${PM2_PROCESS_NAME:-sikhadenge-whatsapp-agent}"
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
printf 'EMAIL_INTERNAL_TEST_PLAN\nAPPLY=%s\nRUNTIME_MODE=INTERNAL_RECIPIENTS\nRECIPIENT=%s\nSENDER=%s\nAUTOMATION_ENABLED=false\nPOST_TEST_MODE=DRY_RUN\n' "$APPLY" "$RECIPIENT" "$SENDER"
[[ "$APPLY" == "1" ]] || { printf 'INFO: preview only\n'; exit 0; }
[[ "$(id -u)" == "0" ]] || fail "APPLY=1 requires root"
install -d -m 700 "$BACKUP_DIR"
cp -a "$ENV_FILE" "$BACKUP_DIR/.env.before"
chmod 600 "$BACKUP_DIR/.env.before"
restored=0
restore(){
  code=$?
  trap - ERR EXIT
  if [[ "$restored" != "1" ]]; then
    bash scripts/email-automation-scheduler-deactivate.sh >/dev/null 2>&1 || true
    cp -a "$BACKUP_DIR/.env.before" "$ENV_FILE" || true
    pm2 restart "$PM2_PROCESS_NAME" --update-env >/dev/null 2>&1 || true
    sleep 3
    APPLY=1 EXPECTED_RELEASE_SHA="$EXPECTED_RELEASE_SHA" APP_DIR="$LIVE_APP" ENV_FILE="$ENV_FILE" bash scripts/email-automation-scheduler-activate.sh >/dev/null 2>&1 || true
    restored=1
  fi
  if [[ "$code" == "0" ]]; then printf 'STATUS=PASS_POST_TEST_DRY_RUN_RESTORED\n' > "$BACKUP_DIR/internal-test-result.txt"; else printf 'STATUS=FAILED_POST_TEST_DRY_RUN_RESTORED\nEXIT_CODE=%s\n' "$code" > "$BACKUP_DIR/internal-test-result.txt"; fi
  chmod 600 "$BACKUP_DIR/internal-test-result.txt" 2>/dev/null || true
  exit "$code"
}
trap restore ERR EXIT
bash scripts/email-automation-scheduler-deactivate.sh >/dev/null 2>&1 || true
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
