#!/usr/bin/env bash
set -Eeuo pipefail

: "${RUN_ID_SAFE:?RUN_ID_SAFE is required}"
: "${TARGET_SHA:?TARGET_SHA is required}"
: "${TRANSPORT_CSS:?TRANSPORT_CSS is required}"

ROOT=/var/www/sikhadenge-whatsapp-agent
LIVE_APP="$ROOT/source/apps/whatsapp-agent-dashboard"
RELEASES_ROOT="$ROOT/releases"
PM2_PROCESS_NAME=sikhadenge-whatsapp-agent
PUBLIC_URL=https://whatsapp.sikhadenge.in
PREVIEW_PORT=3199
STAGE_ROOT="/tmp/sikhadenge-${RUN_ID_SAFE}"
STAGE_APP="$STAGE_ROOT/apps/whatsapp-agent-dashboard"
NEW_RELEASE_ROOT="$RELEASES_ROOT/${RUN_ID_SAFE}"
NEW_RELEASE_APP="$NEW_RELEASE_ROOT/apps/whatsapp-agent-dashboard"
BACKUP_DIR="/root/sikhadenge-backups/${RUN_ID_SAFE}"
SOURCE_PAGE="$LIVE_APP/app/inbox/page.tsx"
SOURCE_CSS="$LIVE_APP/app/inbox-page02.css"
PREVIEW_PID=""
OLD_CWD=""
PM2_SWITCHED=0
SOURCE_CHANGED=0
CSS_EXISTED=0

cleanup_preview() {
  if [[ -n "${PREVIEW_PID:-}" ]]; then
    kill "$PREVIEW_PID" >/dev/null 2>&1 || true
    wait "$PREVIEW_PID" >/dev/null 2>&1 || true
    PREVIEW_PID=""
  fi
}

write_pm2_config() {
  local app_cwd="$1"
  local output_file="$2"
  cat > "$output_file" <<EOF
module.exports = {
  apps: [{
    name: "${PM2_PROCESS_NAME}",
    cwd: "${app_cwd}",
    script: "${app_cwd}/node_modules/next/dist/bin/next",
    args: "start -p 3100",
    exec_mode: "fork",
    instances: 1,
    autorestart: true,
    env: { NODE_ENV: "production" }
  }]
};
EOF
}

rollback() {
  local code=$?
  trap - ERR
  cleanup_preview
  printf 'FAIL: PAGE02_DEPLOY_FAILED code=%s\n' "$code" >&2

  if [[ "$PM2_SWITCHED" = "1" && -n "${OLD_CWD:-}" && -d "$OLD_CWD" ]]; then
    write_pm2_config "$OLD_CWD" "$BACKUP_DIR/pm2-rollback.cjs"
    pm2 startOrReload "$BACKUP_DIR/pm2-rollback.cjs" --only "$PM2_PROCESS_NAME" --update-env >/dev/null 2>&1 || true
    pm2 save --force >/dev/null 2>&1 || true
  fi

  if [[ "$SOURCE_CHANGED" = "1" ]]; then
    cp -a "$BACKUP_DIR/page.tsx.before" "$SOURCE_PAGE" || true
    if [[ "$CSS_EXISTED" = "1" ]]; then
      cp -a "$BACKUP_DIR/inbox-page02.css.before" "$SOURCE_CSS" || true
    else
      rm -f "$SOURCE_CSS" || true
    fi
  fi

  printf 'PASS: PAGE02_AUTOMATIC_ROLLBACK_FINISHED\n' >&2
  exit "$code"
}
trap rollback ERR

# Preconditions and source backup.
test -d "$LIVE_APP"
test -s "$LIVE_APP/.env"
test -s "$LIVE_APP/public/sikhadenge-official-logo.png"
test -s "$LIVE_APP/public/sikhadenge-app-mark-v3.svg"
test -s "$SOURCE_PAGE"
test -s "$TRANSPORT_CSS"
command -v node >/dev/null
command -v npm >/dev/null
command -v pm2 >/dev/null
command -v rsync >/dev/null
install -d -m 700 "$BACKUP_DIR" "$STAGE_ROOT"
install -d -m 755 "$RELEASES_ROOT"

PM2JSON="$(mktemp)"
pm2 jlist > "$PM2JSON"
OLD_CWD="$(node - "$PM2_PROCESS_NAME" "$PM2JSON" <<'NODE'
const fs=require('node:fs');
const [name,file]=process.argv.slice(2);
const p=JSON.parse(fs.readFileSync(file,'utf8')).find(x=>x.name===name);
if(!p) process.exit(2);
if(String(p.pm2_env?.status||'') !== 'online') process.exit(3);
process.stdout.write(String(p.pm2_env?.pm_cwd||''));
NODE
)"
rm -f "$PM2JSON"
case "$OLD_CWD" in
  "$ROOT"/*) ;;
  *) printf 'Unexpected current PM2 cwd: %s\n' "$OLD_CWD" >&2; exit 71 ;;
esac
test -d "$OLD_CWD/.next"
printf 'OLD_RUNTIME_CWD=%s\n' "$OLD_CWD"
printf 'PASS: PAGE02_LIVE_PREFLIGHT\n'

cp -a "$SOURCE_PAGE" "$BACKUP_DIR/page.tsx.before"
if [[ -f "$SOURCE_CSS" ]]; then
  CSS_EXISTED=1
  cp -a "$SOURCE_CSS" "$BACKUP_DIR/inbox-page02.css.before"
fi
git -C "$LIVE_APP" rev-parse HEAD > "$BACKUP_DIR/source-before.sha" || true
cat "$OLD_CWD/.next/BUILD_ID" > "$BACKUP_DIR/build-before.id"

# Candidate release starts from the exact current live source, then receives only
# Page 02 presentation changes. Database/API source is not replaced from a branch.
rsync -a --delete \
  --exclude='.next' --exclude='node_modules' --exclude='.env' \
  "$LIVE_APP/" "$STAGE_APP/"
ln -s "$LIVE_APP/.env" "$STAGE_APP/.env"
install -m 644 "$TRANSPORT_CSS" "$STAGE_APP/app/inbox-page02.css"
if ! grep -Fq 'import "../inbox-page02.css";' "$STAGE_APP/app/inbox/page.tsx"; then
  grep -Fq 'import "../inbox-enterprise-final.css";' "$STAGE_APP/app/inbox/page.tsx"
  sed -i '/import "\.\.\/inbox-enterprise-final\.css";/a import "../inbox-page02.css";' "$STAGE_APP/app/inbox/page.tsx"
fi
grep -Fq 'import "../inbox-page02.css";' "$STAGE_APP/app/inbox/page.tsx"

cd "$STAGE_APP"
npm install --include=dev --no-audit --no-fund --package-lock=false
npx prisma generate
npm run typecheck
npm run test:inbox-layout
NODE_ENV=production npm run build
test -s "$STAGE_APP/.next/BUILD_ID"
grep -R -Fq -- '--p02-navy-950' "$STAGE_APP/.next/static/css"
printf 'PAGE02_STAGE_BUILD_ID=%s\n' "$(cat "$STAGE_APP/.next/BUILD_ID")"
printf 'PASS: PAGE02_ISOLATED_BUILD_AND_REGRESSION\n'

# Prove the complete build in the same directory/context in which it was created.
NODE_ENV=production node "$STAGE_APP/node_modules/next/dist/bin/next" start -H 127.0.0.1 -p "$PREVIEW_PORT" \
  > "$BACKUP_DIR/preview.log" 2>&1 &
PREVIEW_PID=$!
PREVIEW_LOGIN=000
for attempt in $(seq 1 20); do
  sleep 2
  PREVIEW_LOGIN="$(curl -sS --max-time 8 -o /tmp/${RUN_ID_SAFE}-preview-login.html -w '%{http_code}' "http://127.0.0.1:${PREVIEW_PORT}/login" || true)"
  if [[ "$PREVIEW_LOGIN" = "200" ]]; then break; fi
done
test "$PREVIEW_LOGIN" = "200"
PREVIEW_INBOX="$(curl -sS --max-time 8 -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PREVIEW_PORT}/inbox" || true)"
[[ "$PREVIEW_INBOX" == "302" || "$PREVIEW_INBOX" == "307" || "$PREVIEW_INBOX" == "308" ]]
kill -0 "$PREVIEW_PID"
printf 'PASS: PAGE02_CANDIDATE_BOOT login=%s inbox=%s\n' "$PREVIEW_LOGIN" "$PREVIEW_INBOX"
cleanup_preview

# Promote the complete, already-proven directory as an immutable release.
test ! -e "$NEW_RELEASE_ROOT"
install -d -m 755 "$NEW_RELEASE_ROOT/apps"
mv "$STAGE_APP" "$NEW_RELEASE_APP"
test -s "$NEW_RELEASE_APP/.next/BUILD_ID"
test -s "$NEW_RELEASE_APP/public/sikhadenge-official-logo.png"
test -s "$NEW_RELEASE_APP/public/sikhadenge-app-mark-v3.svg"
grep -R -Fq -- '--p02-navy-950' "$NEW_RELEASE_APP/.next/static/css"
printf 'PASS: PAGE02_IMMUTABLE_RELEASE_PREPARED\n'

# Repoint PM2 to the complete release rather than transplanting .next into an old cwd.
write_pm2_config "$NEW_RELEASE_APP" "$BACKUP_DIR/pm2-new.cjs"
pm2 startOrReload "$BACKUP_DIR/pm2-new.cjs" --only "$PM2_PROCESS_NAME" --update-env
PM2_SWITCHED=1

NEW_CWD=""
PM2_STATUS=""
for attempt in $(seq 1 20); do
  sleep 2
  PM2JSON="$(mktemp)"
  pm2 jlist > "$PM2JSON"
  IFS='|' read -r PM2_STATUS NEW_CWD < <(node - "$PM2_PROCESS_NAME" "$PM2JSON" <<'NODE'
const fs=require('node:fs');
const [name,file]=process.argv.slice(2);
const p=JSON.parse(fs.readFileSync(file,'utf8')).find(x=>x.name===name);
if(!p) process.exit(2);
process.stdout.write(`${p.pm2_env?.status||''}|${p.pm2_env?.pm_cwd||''}\n`);
NODE
  )
  rm -f "$PM2JSON"
  if [[ "$PM2_STATUS" = "online" && "$NEW_CWD" = "$NEW_RELEASE_APP" ]]; then break; fi
done
test "$PM2_STATUS" = "online"
test "$NEW_CWD" = "$NEW_RELEASE_APP"
printf 'PASS: PAGE02_PM2_RELEASE_SWITCHED\n'

LOGIN_STATUS=000
for attempt in $(seq 1 20); do
  sleep 2
  LOGIN_STATUS="$(curl -sS -L --max-time 10 -o /tmp/${RUN_ID_SAFE}-login.html -w '%{http_code}' "${PUBLIC_URL}/login?page02=${RUN_ID_SAFE}" || true)"
  printf 'PAGE02_PUBLIC_WARMUP_ATTEMPT=%s LOGIN_HTTP=%s\n' "$attempt" "$LOGIN_STATUS"
  if [[ "$LOGIN_STATUS" = "200" ]]; then break; fi
done
test "$LOGIN_STATUS" = "200"
INBOX_STATUS="$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' "${PUBLIC_URL}/inbox?page02=${RUN_ID_SAFE}" || true)"
[[ "$INBOX_STATUS" == "200" || "$INBOX_STATUS" == "302" || "$INBOX_STATUS" == "307" || "$INBOX_STATUS" == "308" ]]
LOCAL_LOGIN_STATUS="$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' 'http://127.0.0.1:3100/login')"
test "$LOCAL_LOGIN_STATUS" = "200"
printf 'PASS: PAGE02_APPLICATION_WARM public_login=%s public_inbox=%s local_login=%s\n' "$LOGIN_STATUS" "$INBOX_STATUS" "$LOCAL_LOGIN_STATUS"

# Persist the exact presentation source after runtime health is proven.
install -m 644 "$NEW_RELEASE_APP/app/inbox/page.tsx" "$SOURCE_PAGE"
install -m 644 "$NEW_RELEASE_APP/app/inbox-page02.css" "$SOURCE_CSS"
SOURCE_CHANGED=1
grep -Fq 'import "../inbox-page02.css";' "$SOURCE_PAGE"
grep -Fq -- '--p02-navy-950' "$SOURCE_CSS"
pm2 save --force

{
  printf 'RUN_ID=%s\n' "$RUN_ID_SAFE"
  printf 'TARGET_SHA=%s\n' "$TARGET_SHA"
  printf 'OLD_RUNTIME_CWD=%s\n' "$OLD_CWD"
  printf 'NEW_RUNTIME_CWD=%s\n' "$NEW_RELEASE_APP"
  printf 'BUILD_ID=%s\n' "$(cat "$NEW_RELEASE_APP/.next/BUILD_ID")"
  printf 'LOGIN_HTTP=%s\n' "$LOGIN_STATUS"
  printf 'INBOX_HTTP=%s\n' "$INBOX_STATUS"
  printf 'STATUS=PASS\n'
  printf 'COMPLETED_UTC=%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
} > "$BACKUP_DIR/page02-result.txt"
chmod 600 "$BACKUP_DIR/page02-result.txt"
cat "$BACKUP_DIR/page02-result.txt"

trap - ERR
printf 'PASS: PAGE02_LIVE_DEPLOY_COMPLETE\n'
