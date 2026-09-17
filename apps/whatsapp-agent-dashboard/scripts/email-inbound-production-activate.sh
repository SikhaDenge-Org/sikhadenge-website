#!/usr/bin/env bash
set -Eeuo pipefail

APPLY="${APPLY:-0}"
LIVE_APP="${LIVE_APP:-$(pwd)}"
ENV_FILE="${ENV_FILE:-$LIVE_APP/.env}"
PM2_PROCESS_NAME="${PM2_PROCESS_NAME:-sikhadenge-whatsapp-agent}"
EXPECTED_RELEASE_SHA="${EXPECTED_RELEASE_SHA:-}"
RUN_ID="${RUN_ID:-email-inbound-activate-$(date -u +%Y%m%dT%H%M%SZ)}"
BACKUP_ROOT="${BACKUP_ROOT:-/root/sikhadenge-backups}"
BACKUP_DIR="$BACKUP_ROOT/$RUN_ID"
ACTIVATION_ACCOUNT="${EMAIL_INBOUND_ACTIVATION_ACCOUNT:-}"
BASE_URL="${EMAIL_AUTOMATION_SCHEDULER_BASE_URL:-http://127.0.0.1:3100}"

fail(){ printf 'FAIL: %s\n' "$*" >&2; exit 1; }
read_env_value(){
  local key="$1"
  node - "$ENV_FILE" "$key" <<'NODE'
const fs=require('node:fs'); const [file,key]=process.argv.slice(2); let value='';
for(const raw of fs.readFileSync(file,'utf8').split(/\r?\n/)){const line=raw.trim();if(!line||line.startsWith('#'))continue;const n=line.startsWith('export ')?line.slice(7).trim():line;const i=n.indexOf('=');if(i<1||n.slice(0,i).trim()!==key)continue;value=n.slice(i+1).trim();if(value.length>=2&&((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'"))))value=value.slice(1,-1);}process.stdout.write(value);
NODE
}
sync_pm2_inbound_env(){
  local value
  value="$(read_env_value EMAIL_INBOUND_SYNC_ENABLED)"
  if [[ -n "$value" ]]; then export EMAIL_INBOUND_SYNC_ENABLED="$value"; else unset EMAIL_INBOUND_SYNC_ENABLED; fi
  pm2 restart "$PM2_PROCESS_NAME" --update-env >/dev/null
}

[[ -n "$EXPECTED_RELEASE_SHA" ]] || fail "EXPECTED_RELEASE_SHA is required"
[[ "$ACTIVATION_ACCOUNT" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || fail "EMAIL_INBOUND_ACTIVATION_ACCOUNT is required"
[[ -f "$ENV_FILE" ]] || fail "ENV_FILE not found"
cd "$LIVE_APP"
[[ "$(git rev-parse HEAD 2>/dev/null || true)" == "$EXPECTED_RELEASE_SHA" ]] || fail "git SHA mismatch"
printf 'EMAIL_INBOUND_ACTIVATION_PLAN\nAPPLY=%s\nACCOUNT=%s\nSEND_RUNTIME_MUST_REMAIN=DRY_RUN\nEXTERNAL_WRITES_MUST_REMAIN=false\n' "$APPLY" "$ACTIVATION_ACCOUNT"
[[ "$APPLY" == "1" ]] || { printf 'INFO: preview only\n'; exit 0; }
[[ "$(id -u)" == "0" ]] || fail "APPLY=1 requires root"
install -d -m 700 "$BACKUP_DIR"
cp -a "$ENV_FILE" "$BACKUP_DIR/.env.before"
chmod 600 "$BACKUP_DIR/.env.before"
stage="prepare"
restored=0
restore(){
  code=$?
  trap - ERR EXIT INT TERM
  if [[ "$code" != "0" && "$restored" != "1" ]]; then
    cp -a "$BACKUP_DIR/.env.before" "$ENV_FILE" || true
    sync_pm2_inbound_env >/dev/null 2>&1 || true
    restored=1
  fi
  if [[ "$code" == "0" ]]; then
    printf 'STATUS=PASS_EMAIL_INBOUND_ENABLED\nACCOUNT=%s\n' "$ACTIVATION_ACCOUNT" > "$BACKUP_DIR/inbound-activation-result.txt"
  else
    printf 'STATUS=FAILED_EMAIL_INBOUND_ACTIVATION_ROLLED_BACK\nFAILED_STAGE=%s\nEXIT_CODE=%s\n' "$stage" "$code" > "$BACKUP_DIR/inbound-activation-result.txt"
  fi
  chmod 600 "$BACKUP_DIR/inbound-activation-result.txt" 2>/dev/null || true
  exit "$code"
}
trap restore ERR EXIT INT TERM

stage="validate-safe-send-state"
set -a
source "$ENV_FILE"
set +a
[[ "${EMAIL_RUNTIME_MODE:-}" == "DRY_RUN" ]] || fail "Email send runtime must remain DRY_RUN"
[[ "${EMAIL_EXTERNAL_WRITES_ENABLED:-false}" != "true" ]] || fail "Email external writes must remain disabled"
[[ ${#EMAIL_AUTOMATION_SCHEDULER_TOKEN} -ge 32 ]] || fail "scheduler token missing"

stage="enable-inbound-flag"
node - "$ENV_FILE" <<'NODE'
const fs=require('node:fs'),path=require('node:path');const file=process.argv[2],original=fs.readFileSync(file,'utf8'),stat=fs.statSync(file);const key='EMAIL_INBOUND_SYNC_ENABLED';const kept=original.split(/\r?\n/).filter(raw=>{const line=raw.trim();if(!line||line.startsWith('#'))return true;const n=line.startsWith('export ')?line.slice(7).trim():line;const i=n.indexOf('=');return i<1||n.slice(0,i).trim()!==key;});while(kept.length&&kept.at(-1)==='')kept.pop();kept.push(`${key}=true`,'');const tmp=path.join(path.dirname(file),`.${path.basename(file)}.${process.pid}.tmp`);fs.writeFileSync(tmp,kept.join('\n'),{mode:stat.mode});fs.chmodSync(tmp,stat.mode);try{fs.chownSync(tmp,stat.uid,stat.gid)}catch{}fs.renameSync(tmp,file);
NODE
sync_pm2_inbound_env
sleep 4

stage="verify-runtime-health"
set -a
source "$ENV_FILE"
set +a
health="$BACKUP_DIR/inbound-runtime-health.json"
code="$(curl -sS --max-time 10 -o "$health" -w '%{http_code}' -H "Authorization: Bearer $EMAIL_AUTOMATION_SCHEDULER_TOKEN" "${BASE_URL%/}/api/internal/email/automation/process" || true)"
[[ "$code" == "200" ]] || fail "protected scheduler health returned HTTP ${code:-unreachable}"
node - "$health" <<'NODE'
const fs=require('node:fs');const h=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));if(h.runtimeMode!=='DRY_RUN')throw new Error('send runtime drifted from DRY_RUN');if(h.externalWritesEnabled!==false)throw new Error('external writes drifted enabled');if(h.inboundSyncEnabled!==true)throw new Error('inbound sync flag not active');
NODE

stage="start-watch-and-first-sync"
EXPECTED_RELEASE_SHA="$EXPECTED_RELEASE_SHA" EMAIL_INBOUND_ACTIVATION_ACCOUNT="$ACTIVATION_ACCOUNT" \
  npx tsx scripts/email-inbound-production-activate.ts | tee "$BACKUP_DIR/inbound-activation.json"

stage="verify-scheduler"
systemctl is-active --quiet sikhadenge-email-automation-scheduler.timer || fail "email automation scheduler timer is not active"
chmod 600 "$BACKUP_DIR"/*
trap - ERR EXIT INT TERM
printf 'EMAIL_INBOUND_PRODUCTION_ACTIVATION=PASS\nEVIDENCE_DIR=%s\n' "$BACKUP_DIR"
printf 'STATUS=PASS_EMAIL_INBOUND_ENABLED\nACCOUNT=%s\n' "$ACTIVATION_ACCOUNT" > "$BACKUP_DIR/inbound-activation-result.txt"
chmod 600 "$BACKUP_DIR/inbound-activation-result.txt"
