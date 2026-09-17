#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${AUDIT_ROOT:-/var/www/sikhadenge.in/sikhadenge-website-space}"
STAGE="${AUDIT_STAGE:-$(git rev-parse --show-toplevel)}"
PORT="${AUDIT_PORT:-3110}"
SLUG="${AUDIT_SLUG:-chatgpt-se-resume-kaise-banaye}"
OUT="${AUDIT_OUT:-/root/sikhadenge-blog-responsive-final-$(date +%Y%m%d_%H%M%S)}"
BRANCH="${AUDIT_BRANCH:-redesign/blog-template-20260725}"

mkdir -p "$OUT"

if [ -L "$STAGE/node_modules" ]; then
  LINK_TARGET="$(readlink -f "$STAGE/node_modules" 2>/dev/null || true)"
  if [ "$LINK_TARGET" = "$ROOT/node_modules" ]; then
    rm -f "$STAGE/node_modules"
  else
    echo "Unexpected node_modules symlink: ${LINK_TARGET:-unresolved}" >&2
    exit 1
  fi
elif [ -e "$STAGE/node_modules" ]; then
  echo "Unexpected regular node_modules path in stage." >&2
  exit 1
fi

test "$(git -C "$STAGE" branch --show-current)" = "$BRANCH"
test -z "$(git -C "$STAGE" status --porcelain)"
test -z "$(git -C "$ROOT" status --porcelain)"
test -f "$STAGE/.next/BUILD_ID"
test -d "$ROOT/node_modules"
test "$(ss -H -ltnp "sport = :$PORT" 2>/dev/null | wc -l)" -eq 0

DB_URL="$(
  pm2 jlist |
  jq -r '
    .[]
    | select(.name=="sikhadenge-in" or .pm_id==3)
    | (.pm2_env.env.DATABASE_URL // .pm2_env.DATABASE_URL // empty)
  ' |
  head -n 1
)"

test -n "$DB_URL"

BROWSER="$(
  NODE_PATH="$ROOT/node_modules" \
  node -e 'console.log(require("playwright").chromium.executablePath())' 2>/dev/null || true
)"

if [ ! -x "$BROWSER" ]; then
  BROWSER=""
  for CANDIDATE in \
    /usr/bin/google-chrome-stable \
    /usr/bin/google-chrome \
    /usr/bin/chromium-browser \
    /snap/bin/chromium
  do
    if [ -x "$CANDIDATE" ]; then
      BROWSER="$CANDIDATE"
      break
    fi
  done
fi

test -n "$BROWSER"
test -x "$BROWSER"
"$BROWSER" --version > "$OUT/browser-version.txt" 2>&1

ln -s "$ROOT/node_modules" "$STAGE/node_modules"

cleanup() {
  rm -f "$STAGE/node_modules"
  unset DB_URL
}
trap cleanup EXIT

set +e
(
  cd "$STAGE"
  DATABASE_URL="$DB_URL" \
  AUDIT_ROOT="$ROOT" \
  AUDIT_STAGE="$STAGE" \
  AUDIT_PORT="$PORT" \
  AUDIT_OUT="$OUT" \
  AUDIT_SLUG="$SLUG" \
  PLAYWRIGHT_EXECUTABLE_PATH="$BROWSER" \
  node scripts/audit-blog-responsive.mjs
) 2>&1 | tee "$OUT/runner.log"
AUDIT_RC=${PIPESTATUS[0]}
set -e

cleanup
trap - EXIT

echo
echo "===== RESPONSIVE FINAL RESULT ====="
echo "AUDIT_EXIT_CODE=$AUDIT_RC"
echo "STAGE_HEAD=$(git -C "$STAGE" rev-parse HEAD)"
echo "STAGE_BUILD_ID=$(cat "$STAGE/.next/BUILD_ID")"
echo "PORT_${PORT}_LISTENERS=$(ss -H -ltnp "sport = :$PORT" 2>/dev/null | wc -l)"
echo "STAGE_DIRTY_FILES=$(git -C "$STAGE" status --porcelain | wc -l)"
echo "LIVE_DIRTY_FILES=$(git -C "$ROOT" status --porcelain | wc -l)"
echo "PM2_STATUS=$(pm2 jlist | jq -r '.[] | select(.name=="sikhadenge-in") | .pm2_env.status')"
echo "BROWSER_EXECUTABLE=$BROWSER"
echo "BROWSER_VERSION=$(cat "$OUT/browser-version.txt")"
echo "REPORT_DIR=$OUT"

echo
cat "$OUT/responsive-audit.txt" 2>/dev/null || true

echo
ls -lh "$OUT"

exit "$AUDIT_RC"
