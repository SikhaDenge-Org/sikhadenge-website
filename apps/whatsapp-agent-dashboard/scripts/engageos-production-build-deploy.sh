#!/usr/bin/env bash
set -Eeuo pipefail

: "${LIVE_APP:?LIVE_APP is required}"
: "${STAGE_APP:?STAGE_APP is required}"
: "${RELEASE_SHA:?RELEASE_SHA is required}"
: "${RUN_ID:?RUN_ID is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required}"

PM2_PROCESS_NAME="${PM2_PROCESS_NAME:-sikhadenge-whatsapp-agent}"
RELEASE_BRANCH="${RELEASE_BRANCH:-release/whatsapp-instagram-agent-flow-20260731}"
OLD_SOURCE_SHA="$(cat "$BACKUP_DIR/source-before.sha")"
OLD_BUILD_ID="$(cat "$BACKUP_DIR/build-before.id")"
OLD_NEXT="$LIVE_APP/.next-before-engageos-${RUN_ID}"
STAGED_NEXT="$LIVE_APP/.next-stage-engageos-${RUN_ID}"
FAILED_NEXT="$LIVE_APP/.next-failed-engageos-${RUN_ID}"

PM2_JSON_FILE="$(mktemp)"
trap 'rm -f "$PM2_JSON_FILE"' EXIT
pm2 jlist > "$PM2_JSON_FILE"
RUNTIME_APP="$(node - "$PM2_PROCESS_NAME" "$PM2_JSON_FILE" <<'NODE'
const fs = require('node:fs');
const [name, file] = process.argv.slice(2);
const entry = JSON.parse(fs.readFileSync(file, 'utf8')).find((item) => item.name === name);
if (!entry) process.exit(1);
process.stdout.write(String(entry.pm2_env?.pm_cwd || ''));
NODE
)"
rm -f "$PM2_JSON_FILE"
trap - EXIT

if [[ -z "$RUNTIME_APP" ]]; then
  RUNTIME_APP="$LIVE_APP"
fi
case "$RUNTIME_APP" in
  /var/www/sikhadenge-whatsapp-agent/*) ;;
  *) printf 'FAIL: unexpected PM2 runtime cwd: %s\n' "$RUNTIME_APP" >&2; exit 1 ;;
esac

test -d "$RUNTIME_APP"
test -d "$RUNTIME_APP/.next"
OLD_RUNTIME_BUILD_ID="$(cat "$RUNTIME_APP/.next/BUILD_ID")"
test -n "$OLD_RUNTIME_BUILD_ID"

RUNTIME_OLD_NEXT="$RUNTIME_APP/.next-before-engageos-${RUN_ID}"
RUNTIME_STAGED_NEXT="$RUNTIME_APP/.next-stage-engageos-${RUN_ID}"
RUNTIME_FAILED_NEXT="$RUNTIME_APP/.next-failed-engageos-${RUN_ID}"

cleanup_staged_next() {
  [[ ! -d "$STAGED_NEXT" ]] || find "$STAGED_NEXT" -depth -delete
  if [[ "$RUNTIME_APP" != "$LIVE_APP" && -d "$RUNTIME_STAGED_NEXT" ]]; then
    find "$RUNTIME_STAGED_NEXT" -depth -delete
  fi
}
trap cleanup_staged_next ERR

test "$(git -C "$STAGE_APP" rev-parse HEAD)" = "$RELEASE_SHA"
test -d "$STAGE_APP/node_modules"
test -f "$STAGE_APP/.env"
test -s "$STAGE_APP/public/sikhadenge-header-safe-320.png"
test "$(git -C "$STAGE_APP" hash-object "$STAGE_APP/public/sikhadenge-header-safe-320.png")" = "473006e2913e828fe70f7eab869af8a29327295d"

# Page 01 V9 uses the committed original HQ PNG.
# Validate exact bytes, PNG structure, dimensions and SHA-256 before building.
node - "$STAGE_APP" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const app = process.argv[2];

const heroPath = path.join(
  app,
  'public',
  'page01-left-hq-v9.png'
);

const hero = fs.readFileSync(heroPath);

if (hero.length !== 1809804) {
  throw new Error(
    `unexpected Page 01 HQ PNG byte length: ${hero.length}`
  );
}

if (
  hero.subarray(0, 8).toString('hex') !==
  '89504e470d0a1a0a'
) {
  throw new Error('Page 01 HQ asset is not PNG');
}

const width = hero.readUInt32BE(16);
const height = hero.readUInt32BE(20);

if (width !== 1254 || height !== 1254) {
  throw new Error(
    `unexpected Page 01 HQ dimensions: ${width}x${height}`
  );
}

const digest = crypto
  .createHash('sha256')
  .update(hero)
  .digest('hex');

if (
  digest !==
  'e630d1c3d41fea7199efcc0c6300505690f0cecde4d8fe25763a36eda8a2155e'
) {
  throw new Error(
    `unexpected Page 01 HQ SHA-256: ${digest}`
  );
}

const logo = fs.readFileSync(
  path.join(
    app,
    'public',
    'sikhadenge-header-safe-320.png'
  )
);

if (
  logo.length < 1000 ||
  logo.subarray(1, 4).toString('ascii') !== 'PNG'
) {
  throw new Error(
    'canonical SikhaDenge logo is not a valid PNG'
  );
}

console.log(
  `PASS: PAGE01_HQ_V9_ASSET_GATE bytes=${hero.length} dimensions=${width}x${height} sha256=${digest}`
);
NODE

cd "$STAGE_APP"
npx prisma generate
npm run typecheck
NODE_ENV=production npm run build

NEW_BUILD_ID="$(cat "$STAGE_APP/.next/BUILD_ID")"
test -n "$NEW_BUILD_ID"
test "$NEW_BUILD_ID" != "$OLD_BUILD_ID"

cleanup_staged_next
cp -a "$STAGE_APP/.next" "$STAGED_NEXT"
test "$(cat "$STAGED_NEXT/BUILD_ID")" = "$NEW_BUILD_ID"
if [[ "$RUNTIME_APP" != "$LIVE_APP" ]]; then
  cp -a "$STAGE_APP/.next" "$RUNTIME_STAGED_NEXT"
  test "$(cat "$RUNTIME_STAGED_NEXT/BUILD_ID")" = "$NEW_BUILD_ID"
fi

current_branch="$(git -C "$LIVE_APP" branch --show-current)"
test "$current_branch" = "$RELEASE_BRANCH"
test "$(git -C "$LIVE_APP" rev-parse HEAD)" = "$OLD_SOURCE_SHA"
test -z "$(git -C "$LIVE_APP" status --porcelain --untracked-files=no)"
git -C "$LIVE_APP" merge-base --is-ancestor "$OLD_SOURCE_SHA" "$RELEASE_SHA"

[[ ! -e "$OLD_NEXT" ]] || { printf 'FAIL: rollback build path already exists: %s\n' "$OLD_NEXT" >&2; exit 1; }
[[ ! -e "$FAILED_NEXT" ]] || { printf 'FAIL: failed-build path already exists: %s\n' "$FAILED_NEXT" >&2; exit 1; }
if [[ "$RUNTIME_APP" != "$LIVE_APP" ]]; then
  [[ ! -e "$RUNTIME_OLD_NEXT" ]] || { printf 'FAIL: runtime rollback build path already exists: %s\n' "$RUNTIME_OLD_NEXT" >&2; exit 1; }
  [[ ! -e "$RUNTIME_FAILED_NEXT" ]] || { printf 'FAIL: runtime failed-build path already exists: %s\n' "$RUNTIME_FAILED_NEXT" >&2; exit 1; }
fi

ERROR_LOG="/root/.pm2/logs/${PM2_PROCESS_NAME}-error.log"
if [[ -f "$ERROR_LOG" ]]; then stat -c '%s' "$ERROR_LOG" > "$BACKUP_DIR/error-log-size-before.txt"; else printf '0\n' > "$BACKUP_DIR/error-log-size-before.txt"; fi

cat > "$BACKUP_DIR/deploy-state.txt" <<EOF
LIVE_APP=$LIVE_APP
RUNTIME_APP=$RUNTIME_APP
RELEASE_SHA=$RELEASE_SHA
OLD_SOURCE_SHA=$OLD_SOURCE_SHA
OLD_BUILD_ID=$OLD_BUILD_ID
OLD_RUNTIME_BUILD_ID=$OLD_RUNTIME_BUILD_ID
NEW_BUILD_ID=$NEW_BUILD_ID
OLD_NEXT=$OLD_NEXT
FAILED_NEXT=$FAILED_NEXT
RUNTIME_OLD_NEXT=$RUNTIME_OLD_NEXT
RUNTIME_FAILED_NEXT=$RUNTIME_FAILED_NEXT
PM2_PROCESS_NAME=$PM2_PROCESS_NAME
PREPARED_UTC=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
EOF
chmod 600 "$BACKUP_DIR/deploy-state.txt"

git -C "$LIVE_APP" branch "backup/vps-before-engageos-${RUN_ID}" "$OLD_SOURCE_SHA"
git -C "$LIVE_APP" merge --ff-only "$RELEASE_SHA"
test "$(git -C "$LIVE_APP" rev-parse HEAD)" = "$RELEASE_SHA"

# The hero is embedded in the build. Keep the canonical SikhaDenge logo available
# in a separate PM2 runtime if production serves from a mirror directory.
if [[ "$RUNTIME_APP" != "$LIVE_APP" ]]; then
  install -d -m 755 "$RUNTIME_APP/public"
  install -m 644 "$LIVE_APP/public/sikhadenge-header-safe-320.png" "$RUNTIME_APP/public/sikhadenge-header-safe-320.png"
  install -m 644 "$LIVE_APP/public/page01-left-hq-v9.png" "$RUNTIME_APP/public/page01-left-hq-v9.png"
  if [[ -f "$LIVE_APP/public/sikhadenge-official-logo.png" ]]; then
    install -m 644 "$LIVE_APP/public/sikhadenge-official-logo.png" "$RUNTIME_APP/public/sikhadenge-official-logo.png"
  fi
fi
printf 'PASS: PAGE01_HQ_V9_PUBLIC_ASSETS_SYNCED\n'

cd "$LIVE_APP"
npx prisma generate

mv "$LIVE_APP/.next" "$OLD_NEXT"
mv "$STAGED_NEXT" "$LIVE_APP/.next"
test "$(cat "$LIVE_APP/.next/BUILD_ID")" = "$NEW_BUILD_ID"
if [[ "$RUNTIME_APP" != "$LIVE_APP" ]]; then
  mv "$RUNTIME_APP/.next" "$RUNTIME_OLD_NEXT"
  mv "$RUNTIME_STAGED_NEXT" "$RUNTIME_APP/.next"
  test "$(cat "$RUNTIME_APP/.next/BUILD_ID")" = "$NEW_BUILD_ID"
fi

printf 'ACTIVATED_UTC=%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" >> "$BACKUP_DIR/deploy-state.txt"
pm2 restart "$PM2_PROCESS_NAME"
sleep 5

test "$(cat "$LIVE_APP/.next/BUILD_ID")" = "$NEW_BUILD_ID"
test "$(cat "$RUNTIME_APP/.next/BUILD_ID")" = "$NEW_BUILD_ID"
printf 'RUNTIME_APP=%s\n' "$RUNTIME_APP"
printf 'OLD_RUNTIME_BUILD_ID=%s\n' "$OLD_RUNTIME_BUILD_ID"
printf 'NEW_BUILD_ID=%s\n' "$NEW_BUILD_ID"
printf 'ROLLBACK_BUILD_PATH=%s\n' "$OLD_NEXT"
if [[ "$RUNTIME_APP" != "$LIVE_APP" ]]; then printf 'RUNTIME_ROLLBACK_BUILD_PATH=%s\n' "$RUNTIME_OLD_NEXT"; fi
printf 'PASS: RELEASE_BUILD_ACTIVATED\n'
