#!/usr/bin/env bash
set -Eeuo pipefail

BASE_SHA=28b813ca9936fe0b9d3874f7ebf6b0dfeef0b242
GOOD_BUILD=ZvzV6QBBngX3s_X5xxUnk
NAME=sikhadenge-whatsapp-agent
REPO=/var/www/sikhadenge-whatsapp-agent/source
LIVE=/var/www/sikhadenge-whatsapp-agent/releases/reconcile-clean-28b813ca-20260915T043800Z/apps/whatsapp-agent-dashboard
TAG="score-only-${RUN_ID:-manual}"
STAGE_ROOT="/tmp/$TAG"
STAGE="$STAGE_ROOT/apps/whatsapp-agent-dashboard"
CSS_REL=apps/whatsapp-agent-dashboard/app/page02-right-intelligence-v19.css
CSS="$STAGE_ROOT/$CSS_REL"
OLD="$LIVE/.next-before-$TAG"
NEW="$LIVE/.next-candidate-$TAG"
LOG="/tmp/$TAG.log"

cleanup() {
  git -C "$REPO" worktree remove --force "$STAGE_ROOT" >/dev/null 2>&1 || true
  rm -f "$LOG" >/dev/null 2>&1 || true
}
trap cleanup EXIT

test "$(git -C "$LIVE" rev-parse HEAD)" = "$BASE_SHA"
test "$(cat "$LIVE/.next/BUILD_ID")" = "$GOOD_BUILD"
test -x "$LIVE/node_modules/next/dist/bin/next"
test -f "$LIVE/.env"
test ! -e "$OLD"
test ! -e "$NEW"

J=$(mktemp)
pm2 jlist > "$J"
ACTIVE=$(node - "$J" <<'NODE'
const fs=require('node:fs');
const p=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).find(x=>x.name==='sikhadenge-whatsapp-agent');
if(!p?.pm2_env?.pm_cwd || p.pm2_env.status!=='online') process.exit(2);
process.stdout.write(p.pm2_env.pm_cwd);
NODE
)
rm -f "$J"
test "$ACTIVE" = "$LIVE"

git -C "$REPO" worktree add --detach "$STAGE_ROOT" "$BASE_SHA"
ln -s "$LIVE/.env" "$STAGE/.env"
ln -s "$LIVE/node_modules" "$STAGE/node_modules"

cat >> "$CSS" <<'CSS'

/* Qualification Score linear reference-only override — ONLY .sx-score */
.sx-inbox > .sx-details > .sx-score {
  display: block !important;
  min-height: 154px !important;
  padding: 16px !important;
}
.sx-inbox > .sx-details > .sx-score::after { display: none !important; }
.sx-inbox > .sx-details > .sx-score .sx-score-ring {
  position: relative !important;
  display: flex !important;
  align-items: flex-start !important;
  width: 100% !important;
  height: 88px !important;
  margin: 0 !important;
  border-radius: 0 !important;
  background: none !important;
  box-shadow: none !important;
  filter: none !important;
  counter-reset: sxqualscore var(--sx-score, 0);
}
.sx-inbox > .sx-details > .sx-score .sx-score-ring::before {
  content: "" !important;
  position: absolute !important;
  inset: auto !important;
  left: 0 !important;
  right: 0 !important;
  top: 50px !important;
  width: auto !important;
  height: 10px !important;
  border: 0 !important;
  border-radius: 999px !important;
  background: #e8eef6 !important;
  box-shadow: inset 0 1px 2px rgba(41,72,116,.06) !important;
}
.sx-inbox > .sx-details > .sx-score .sx-score-ring::after {
  content: "" !important;
  position: absolute !important;
  inset: auto !important;
  left: 0 !important;
  top: 50px !important;
  width: calc(var(--sx-score, 0) * 1%) !important;
  height: 10px !important;
  border-radius: 999px !important;
  background: linear-gradient(90deg,#3279ff 0%,#1fc9ee 100%) !important;
  box-shadow: 0 4px 12px rgba(31,137,255,.18) !important;
}
.sx-inbox > .sx-details > .sx-score .sx-score-ring strong {
  position: static !important;
  z-index: 2 !important;
  color: #102449 !important;
  font-size: 27px !important;
  line-height: 32px !important;
  font-weight: 860 !important;
  letter-spacing: -.04em !important;
}
.sx-inbox > .sx-details > .sx-score .sx-score-ring strong::before {
  content: "" !important;
  position: absolute !important;
  z-index: 4 !important;
  left: clamp(0%, calc(var(--sx-score, 0) * 1%), 100%) !important;
  top: 45px !important;
  width: 20px !important;
  height: 20px !important;
  transform: translateX(-50%) !important;
  border: 4px solid #fff !important;
  border-radius: 50% !important;
  background: #2376ff !important;
  box-shadow: 0 4px 12px rgba(35,118,255,.28) !important;
}
.sx-inbox > .sx-details > .sx-score .sx-score-ring strong::after {
  content: counter(sxqualscore) "%" !important;
  position: absolute !important;
  z-index: 3 !important;
  right: 0 !important;
  top: 0 !important;
  min-width: 64px !important;
  height: 32px !important;
  padding: 0 12px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  border-radius: 999px !important;
  background: #edf5ff !important;
  color: #1768ff !important;
  font-size: 13px !important;
  line-height: 1 !important;
  font-weight: 820 !important;
}
.sx-inbox > .sx-details > .sx-score .sx-score-ring span {
  position: static !important;
  z-index: 2 !important;
  margin: 3px 0 0 7px !important;
  color: #8e9bb1 !important;
  font-size: 18px !important;
  line-height: 27px !important;
  font-weight: 560 !important;
  letter-spacing: -.025em !important;
}
.sx-inbox > .sx-details > .sx-score .sx-score-ring span::before,
.sx-inbox > .sx-details > .sx-score .sx-score-ring span::after {
  position: absolute !important;
  top: 68px !important;
  color: #8a98ae !important;
  font-size: 10px !important;
  line-height: 12px !important;
  font-weight: 720 !important;
}
.sx-inbox > .sx-details > .sx-score .sx-score-ring span::before { content: "1" !important; left: 0 !important; }
.sx-inbox > .sx-details > .sx-score .sx-score-ring span::after { content: "100" !important; right: 0 !important; }
.sx-inbox > .sx-details > .sx-score > div:last-child { min-width: 0 !important; margin-top: 7px !important; }
.sx-inbox > .sx-details > .sx-score > div:last-child > strong {
  margin: 0 0 4px !important;
  color: #102449 !important;
  font-size: 14px !important;
  line-height: 19px !important;
  font-weight: 840 !important;
  letter-spacing: -.015em !important;
}
.sx-inbox > .sx-details > .sx-score p {
  max-width: 100% !important;
  margin: 0 !important;
  color: #7f8fa8 !important;
  font-size: 10.5px !important;
  line-height: 1.45 !important;
}
CSS

CHANGED="$(git -C "$STAGE_ROOT" diff --name-only)"
test "$CHANGED" = "$CSS_REL"
git -C "$STAGE_ROOT" diff --check
echo "PASS: ONE_FILE_SOURCE_SCOPE_LOCKED $CHANGED"

cd "$STAGE"
npm run typecheck
NODE_ENV=production npm run build
BUILD="$(cat .next/BUILD_ID)"
test -n "$BUILD"
test "$BUILD" != "$GOOD_BUILD"

./node_modules/next/dist/bin/next start -p 3111 > "$LOG" 2>&1 &
PID=$!
CODE=000
for _ in $(seq 1 25); do
  CODE=$(curl --max-time 3 -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3111/login || true)
  case "$CODE" in 200|301|302|303|307|308) break ;; esac
  sleep 1
done
IC=$(curl --max-time 5 -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3111/inbox || true)
kill "$PID" >/dev/null 2>&1 || true
wait "$PID" >/dev/null 2>&1 || true
case "$CODE" in 200|301|302|303|307|308) ;; *) cat "$LOG"; exit 31 ;; esac
case "$IC" in 200|301|302|303|307|308) ;; *) cat "$LOG"; exit 32 ;; esac
echo "PASS: CANDIDATE_HEALTHY build=$BUILD login=$CODE inbox=$IC"

cp -a "$STAGE/.next" "$NEW"
test "$(cat "$NEW/BUILD_ID")" = "$BUILD"

rollback() {
  set +e
  if test -d "$OLD"; then
    rm -rf "$LIVE/.next"
    mv "$OLD" "$LIVE/.next"
  fi
  rm -rf "$NEW"
  pm2 restart "$NAME" >/dev/null 2>&1
  sleep 5
  pm2 save >/dev/null 2>&1
}
trap rollback ERR

mv "$LIVE/.next" "$OLD"
mv "$NEW" "$LIVE/.next"
test "$(cat "$LIVE/.next/BUILD_ID")" = "$BUILD"
pm2 restart "$NAME"
sleep 5

LOCAL_LOGIN=$(curl --max-time 15 -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/login)
LOCAL_INBOX=$(curl --max-time 15 -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/inbox)
PUBLIC_LOGIN=$(curl --max-time 20 -sS -L -o /dev/null -w '%{http_code}' 'https://whatsapp.sikhadenge.in/login?score-only=1')
PUBLIC_INBOX=$(curl --max-time 20 -sS -o /dev/null -w '%{http_code}' 'https://whatsapp.sikhadenge.in/inbox?score-only=1')
test "$LOCAL_LOGIN" = 200
test "$PUBLIC_LOGIN" = 200
case "$LOCAL_INBOX" in 200|301|302|303|307|308) ;; *) exit 41 ;; esac
case "$PUBLIC_INBOX" in 200|301|302|303|307|308) ;; *) exit 42 ;; esac
test "$(git -C "$LIVE" rev-parse HEAD)" = "$BASE_SHA"
test "$(cat "$LIVE/.next/BUILD_ID")" = "$BUILD"
pm2 save >/dev/null
trap - ERR

echo "PASS: QUALIFICATION_SCORE_ONLY_LIVE"
echo "BASE_SOURCE=$BASE_SHA"
echo "PREVIOUS_BUILD=$GOOD_BUILD"
echo "ACTIVE_BUILD=$BUILD"
echo "CHANGED_FILE=$CSS_REL"
echo "PUBLIC_LOGIN=$PUBLIC_LOGIN PUBLIC_INBOX=$PUBLIC_INBOX"
