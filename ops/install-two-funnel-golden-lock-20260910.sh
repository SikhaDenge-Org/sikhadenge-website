#!/usr/bin/env bash
set -Eeuo pipefail

SITE='/etc/nginx/sites-enabled/sikhadenge.in-ssl'
AI_SNIP='/etc/nginx/snippets/sikhadenge-ai-video-3940.conf'
CL_ASSETS='/etc/nginx/snippets/sikhadenge-claude-31aug6pm-assets-final.conf'
SEAL_SRC='/tmp/sikhadenge-funnel-seal-current.sh'
GUARD_SRC='/tmp/sikhadenge-funnel-golden-guard.sh'
CTL_SRC='/tmp/sikhadenge-funnel-lockctl.sh'
SEAL='/usr/local/sbin/sikhadenge-funnel-seal-current'
GUARD='/usr/local/sbin/sikhadenge-funnel-golden-guard'
CTL='/usr/local/sbin/sikhadenge-funnel-lockctl'
SERVICE='/etc/systemd/system/sikhadenge-funnel-golden-guard.service'
TIMER='/etc/systemd/system/sikhadenge-funnel-golden-guard.timer'
TS="$(date +%Y%m%d-%H%M%S)"
BK="/var/backups/sikhadenge/funnel-golden-lock-install-$TS"
MUTATED=0

[[ ${EUID:-$(id -u)} -eq 0 ]] || { echo 'installer must run as root' >&2; exit 1; }
for f in "$SITE" "$AI_SNIP" "$CL_ASSETS" "$SEAL_SRC" "$GUARD_SRC" "$CTL_SRC"; do [[ -s "$f" ]] || { echo "missing required file: $f" >&2; exit 1; }; done
for f in "$SEAL_SRC" "$GUARD_SRC" "$CTL_SRC"; do bash -n "$f"; done
nginx -t >/dev/null

mkdir -p "$BK"
cp -a "$SITE" "$BK/site.before"
cp -a "$AI_SNIP" "$BK/ai-snippet.before"
cp -a "$CL_ASSETS" "$BK/claude-assets.before"
for f in "$SEAL" "$GUARD" "$CTL" "$SERVICE" "$TIMER"; do [[ -e "$f" ]] && cp -a "$f" "$BK/$(basename "$f").before" || true; done
systemctl is-enabled sikhadenge-funnel-golden-guard.timer > "$BK/timer.enabled.before" 2>/dev/null || true
systemctl is-active sikhadenge-funnel-golden-guard.timer > "$BK/timer.active.before" 2>/dev/null || true

rollback(){
  rc=$?; trap - ERR INT TERM; set +e
  echo "ROLLBACK rc=$rc backup=$BK"
  systemctl disable --now sikhadenge-funnel-golden-guard.timer >/dev/null 2>&1 || true
  cp -a "$BK/site.before" "$SITE"
  cp -a "$BK/ai-snippet.before" "$AI_SNIP"
  cp -a "$BK/claude-assets.before" "$CL_ASSETS"
  for dest in "$SEAL" "$GUARD" "$CTL" "$SERVICE" "$TIMER"; do
    before="$BK/$(basename "$dest").before"
    if [[ -e "$before" ]]; then cp -a "$before" "$dest"; else rm -f "$dest"; fi
  done
  systemctl daemon-reload >/dev/null 2>&1 || true
  nginx -t >/dev/null 2>&1 && systemctl reload nginx || true
  exit "$rc"
}
trap rollback ERR INT TERM

echo '[1/8] Verify both currently approved pages before sealing'
for spec in \
  'https://sikhadenge.in/masterclass/ai-video|Create cinematic AI videos' \
  'https://sikhadenge.in/masterclass/claude/free|AI tools'; do
  url=${spec%%|*}; marker=${spec##*|}; out="/tmp/prelock-$RANDOM.html"
  code=$(curl -L -sS --connect-timeout 5 --max-time 30 -o "$out" -w '%{http_code}' "$url?prelock=$TS" || true)
  [[ "$code" == 200 ]]; grep -Fqi "$marker" "$out"; rm -f "$out"
done

echo '[2/8] Install root-owned lock utilities'
install -m 0750 "$SEAL_SRC" "$SEAL"
install -m 0750 "$GUARD_SRC" "$GUARD"
install -m 0750 "$CTL_SRC" "$CTL"
MUTATED=1

echo '[3/8] Create atomic Golden seal from exact live approved state'
"$SEAL"

echo '[4/8] Install systemd self-heal service + one-minute timer'
cat > "$SERVICE" <<'EOF'
[Unit]
Description=SikhaDenge AI Video + Claude Golden Funnel Guard
Documentation=https://github.com/maihoonankitsingh/sikhadenge-website
After=network-online.target nginx.service
Wants=network-online.target

[Service]
Type=oneshot
User=root
Group=root
ExecStart=/usr/local/sbin/sikhadenge-funnel-golden-guard
TimeoutStartSec=55
Nice=10
IOSchedulingClass=idle
UMask=0077

[Install]
WantedBy=multi-user.target
EOF
cat > "$TIMER" <<'EOF'
[Unit]
Description=Check SikhaDenge Golden masterclass funnels every minute

[Timer]
OnActiveSec=30s
OnUnitInactiveSec=60s
AccuracySec=5s
Unit=sikhadenge-funnel-golden-guard.service

[Install]
WantedBy=timers.target
EOF
chmod 0644 "$SERVICE" "$TIMER"
systemctl daemon-reload
systemctl enable --now sikhadenge-funnel-golden-guard.timer

echo '[5/8] Persist current PM2 process set for reboot recovery'
export HOME=/root PM2_HOME=/root/.pm2
pm2 save >/dev/null

echo '[6/8] Run immediate deep Golden verification'
"$GUARD" --deep

echo '[7/8] Verify timer + exact historical failure assets'
systemctl is-enabled sikhadenge-funnel-golden-guard.timer | grep -qx enabled
systemctl is-active sikhadenge-funnel-golden-guard.timer | grep -qx active
for spec in \
  '/_next/static/css/0dc2b316d6c10c6c.css|b8a14f1749fa0ed41a228385c09df949b55805d8cf46cf7a7f34d1407390587c' \
  '/_next/static/chunks/pages/masterclass/ai-video-e4484da06cac6162.js|24fd9da08dd61cd75b0528bbb680c15a5f8f1dedfb6834106603a963cea5f80c'; do
  u=${spec%%|*}; want=${spec##*|}; curl -fsSL --max-time 20 "https://sikhadenge.in$u?lockverify=$TS" -o /tmp/lock-asset
  got=$(sha256sum /tmp/lock-asset | awk '{print $1}'); [[ "$got" == "$want" ]] || { echo "asset hash mismatch $u" >&2; exit 1; }
done

echo '[8/8] Final public QA'
AI_CODE=$(curl -L -sS --max-time 30 -o /tmp/lock-ai.html -w '%{http_code}' "https://sikhadenge.in/masterclass/ai-video?lockfinal=$TS")
CL_CODE=$(curl -L -sS --max-time 30 -o /tmp/lock-cl.html -w '%{http_code}' "https://sikhadenge.in/masterclass/claude/free?lockfinal=$TS")
[[ "$AI_CODE" == 200 && "$CL_CODE" == 200 ]]
grep -Fqi 'Six blocks' /tmp/lock-ai.html
grep -Fqi 'better results' /tmp/lock-cl.html
nginx -t >/dev/null

trap - ERR INT TERM
printf '%s\n' \
  '============================================================' \
  'TWO-FUNNEL GOLDEN LOCK INSTALLED' \
  "BACKUP=$BK" \
  'PROTECTED=/masterclass/ai-video,/masterclass/claude/free' \
  'MODE=Golden seal + source/config integrity + PM2 recovery + 60s self-heal + 5m deep asset verification' \
  'UNRELATED_SITE_CONFIG=NOT_LOCKED' \
  'CONTROL=sikhadenge-funnel-lockctl status|check|unlock|lock|reseal' \
  "AI_HTTP=$AI_CODE CLAUDE_HTTP=$CL_CODE" \
  '============================================================'
