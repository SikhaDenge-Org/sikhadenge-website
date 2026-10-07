#!/usr/bin/env bash
set -Eeuo pipefail
APPLY="${APPLY:-0}"
LIVE_APP="${LIVE_APP:-$(pwd)}"
ENV_FILE="${ENV_FILE:-$LIVE_APP/.env}"
PM2_PROCESS_NAME="${PM2_PROCESS_NAME:-sikhadenge-whatsapp-agent}"
EXPECTED_RELEASE_SHA="${EXPECTED_RELEASE_SHA:-}"
BACKUP_ROOT="${BACKUP_ROOT:-/root/sikhadenge-backups}"
RUN_ID="${RUN_ID:-email-dryrun-$(date -u +%Y%m%dT%H%M%SZ)}"
BACKUP_DIR="$BACKUP_ROOT/$RUN_ID"
fail(){ printf 'FAIL: %s\n' "$*" >&2; exit 1; }
read_env_value(){
  local key="$1"
  node - "$ENV_FILE" "$key" <<'NODE'
const fs = require('node:fs');
const [file, key] = process.argv.slice(2);
let value = '';
for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
  const index = normalized.indexOf('=');
  if (index < 1 || normalized.slice(0, index).trim() !== key) continue;
  value = normalized.slice(index + 1).trim();
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) value = value.slice(1, -1);
}
process.stdout.write(value);
NODE
}
sync_pm2_email_env_from_file(){
  local key value
  for key in EMAIL_RUNTIME_ENABLED EMAIL_AUTOMATION_ENABLED EMAIL_RUNTIME_MODE EMAIL_EXTERNAL_WRITES_ENABLED EMAIL_AUTOMATION_SCHEDULER_TOKEN; do
    value="$(read_env_value "$key")"
    if [[ -n "$value" ]]; then
      export "$key=$value"
    else
      unset "$key"
    fi
  done
  # The production PM2 process can retain previously captured environment values.
  # Explicitly refresh the email runtime keys from the canonical env file so the
  # dynamic scheduler health endpoint sees the same fail-closed state as disk.
  pm2 restart "$PM2_PROCESS_NAME" --update-env >/dev/null
}
[[ -n "$EXPECTED_RELEASE_SHA" ]] || fail "EXPECTED_RELEASE_SHA is required"
[[ -f "$ENV_FILE" ]] || fail "ENV_FILE not found"
cd "$LIVE_APP"
[[ "$(git rev-parse HEAD 2>/dev/null || true)" == "$EXPECTED_RELEASE_SHA" ]] || fail "git SHA mismatch"
printf 'EMAIL_AUTOMATION_DRYRUN_PROVISION_PLAN\nAPPLY=%s\nENV_FILE=%s\nBACKUP_DIR=%s\n' "$APPLY" "$ENV_FILE" "$BACKUP_DIR"
printf 'EMAIL_RUNTIME_ENABLED=true\nEMAIL_AUTOMATION_ENABLED=true\nEMAIL_RUNTIME_MODE=DRY_RUN\nEMAIL_EXTERNAL_WRITES_ENABLED=false\n'
if [[ "$APPLY" != "1" ]]; then printf 'INFO: preview only; no env or PM2 mutation performed\n'; exit 0; fi
[[ "$(id -u)" == "0" ]] || fail "APPLY=1 requires root"
command -v node >/dev/null 2>&1 || fail "node required"
command -v pm2 >/dev/null 2>&1 || fail "pm2 required"
install -d -m 700 "$BACKUP_DIR"
cp -a "$ENV_FILE" "$BACKUP_DIR/.env.before"
chmod 600 "$BACKUP_DIR/.env.before"
rollback(){ code=$?; trap - ERR; cp -a "$BACKUP_DIR/.env.before" "$ENV_FILE" || true; sync_pm2_email_env_from_file >/dev/null 2>&1 || true; printf 'STATUS=ROLLED_BACK_AFTER_FAILURE\n' > "$BACKUP_DIR/rollback-result.txt" || true; exit "$code"; }
trap rollback ERR
node - "$ENV_FILE" <<'NODE'
const fs=require('node:fs'), crypto=require('node:crypto'), path=require('node:path');
const file=process.argv[2]; const original=fs.readFileSync(file,'utf8'); const stat=fs.statSync(file);
const desired={EMAIL_RUNTIME_ENABLED:'true',EMAIL_AUTOMATION_ENABLED:'true',EMAIL_RUNTIME_MODE:'DRY_RUN',EMAIL_EXTERNAL_WRITES_ENABLED:'false'};
let token=''; for(const raw of original.split(/\r?\n/)){const line=raw.trim(); if(!line||line.startsWith('#'))continue; const n=line.startsWith('export ')?line.slice(7).trim():line; const i=n.indexOf('='); if(i<1)continue; if(n.slice(0,i).trim()==='EMAIL_AUTOMATION_SCHEDULER_TOKEN'){token=n.slice(i+1).trim().replace(/^['"]|['"]$/g,'');}}
if(token.length<32) token=crypto.randomBytes(48).toString('base64url'); desired.EMAIL_AUTOMATION_SCHEDULER_TOKEN=token;
const keys=new Set(Object.keys(desired)); const kept=original.split(/\r?\n/).filter(raw=>{const line=raw.trim(); if(!line||line.startsWith('#'))return true; const n=line.startsWith('export ')?line.slice(7).trim():line; const i=n.indexOf('='); return i<1||!keys.has(n.slice(0,i).trim());}); while(kept.length&&kept.at(-1)==='')kept.pop(); for(const [k,v] of Object.entries(desired))kept.push(`${k}=${v}`); kept.push('');
const tmp=path.join(path.dirname(file),`.${path.basename(file)}.${process.pid}.tmp`); fs.writeFileSync(tmp,kept.join('\n'),{mode:stat.mode}); fs.chmodSync(tmp,stat.mode); try{fs.chownSync(tmp,stat.uid,stat.gid);}catch{} fs.renameSync(tmp,file);
NODE
sync_pm2_email_env_from_file
sleep 3
EXPECTED_RELEASE_SHA="$EXPECTED_RELEASE_SHA" ENV_FILE="$ENV_FILE" bash scripts/email-automation-production-preflight.sh
printf 'STATUS=PASS\nEXPECTED_RELEASE_SHA=%s\nCOMPLETED_UTC=%s\n' "$EXPECTED_RELEASE_SHA" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$BACKUP_DIR/provision-result.txt"
chmod 600 "$BACKUP_DIR/provision-result.txt"
trap - ERR
printf 'EMAIL_AUTOMATION_DRYRUN_PROVISION=PASS\nBACKUP_DIR=%s\n' "$BACKUP_DIR"
