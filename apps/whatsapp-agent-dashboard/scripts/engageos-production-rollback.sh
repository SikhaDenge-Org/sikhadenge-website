#!/usr/bin/env bash
set -Eeuo pipefail

: "${LIVE_APP:?LIVE_APP is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required}"

PUBLIC_URL="${PUBLIC_URL:-https://whatsapp.sikhadenge.in}"

test -f "$BACKUP_DIR/deploy-state.txt"

state_value() {
  local key="$1"
  awk -F= -v key="$key" '$1 == key {sub($1 "=", ""); print; exit}' "$BACKUP_DIR/deploy-state.txt"
}

OLD_SOURCE_SHA="$(state_value OLD_SOURCE_SHA)"
OLD_BUILD_ID="$(state_value OLD_BUILD_ID)"
OLD_NEXT="$(state_value OLD_NEXT)"
FAILED_NEXT="$(state_value FAILED_NEXT)"
PM2_PROCESS_NAME="$(state_value PM2_PROCESS_NAME)"
RUNTIME_APP="$(state_value RUNTIME_APP)"
OLD_RUNTIME_BUILD_ID="$(state_value OLD_RUNTIME_BUILD_ID)"
RUNTIME_OLD_NEXT="$(state_value RUNTIME_OLD_NEXT)"
RUNTIME_FAILED_NEXT="$(state_value RUNTIME_FAILED_NEXT)"

: "${OLD_SOURCE_SHA:?missing OLD_SOURCE_SHA}"
: "${OLD_BUILD_ID:?missing OLD_BUILD_ID}"
: "${OLD_NEXT:?missing OLD_NEXT}"
: "${FAILED_NEXT:?missing FAILED_NEXT}"
: "${PM2_PROCESS_NAME:?missing PM2_PROCESS_NAME}"

if [[ -z "$RUNTIME_APP" ]]; then
  RUNTIME_APP="$LIVE_APP"
fi
if [[ -z "$OLD_RUNTIME_BUILD_ID" ]]; then
  OLD_RUNTIME_BUILD_ID="$OLD_BUILD_ID"
fi
if [[ -z "$RUNTIME_OLD_NEXT" ]]; then
  RUNTIME_OLD_NEXT="$OLD_NEXT"
fi
if [[ -z "$RUNTIME_FAILED_NEXT" ]]; then
  RUNTIME_FAILED_NEXT="$FAILED_NEXT"
fi

case "$RUNTIME_APP" in
  /var/www/sikhadenge-whatsapp-agent/*) ;;
  *)
    printf 'FAIL: unexpected PM2 runtime cwd during rollback: %s\n' "$RUNTIME_APP" >&2
    exit 1
    ;;
esac

current_build_id="$(cat "$LIVE_APP/.next/BUILD_ID" 2>/dev/null || true)"
if [[ "$current_build_id" != "$OLD_BUILD_ID" ]]; then
  test -d "$OLD_NEXT"
  if [[ -e "$FAILED_NEXT" ]]; then
    printf 'FAIL: failed-build preservation path already exists: %s\n' "$FAILED_NEXT" >&2
    exit 1
  fi
  mv "$LIVE_APP/.next" "$FAILED_NEXT"
  mv "$OLD_NEXT" "$LIVE_APP/.next"
fi

if [[ "$RUNTIME_APP" != "$LIVE_APP" ]]; then
  current_runtime_build_id="$(cat "$RUNTIME_APP/.next/BUILD_ID" 2>/dev/null || true)"
  if [[ "$current_runtime_build_id" != "$OLD_RUNTIME_BUILD_ID" ]]; then
    test -d "$RUNTIME_OLD_NEXT"
    if [[ -e "$RUNTIME_FAILED_NEXT" ]]; then
      printf 'FAIL: runtime failed-build preservation path already exists: %s\n' "$RUNTIME_FAILED_NEXT" >&2
      exit 1
    fi
    mv "$RUNTIME_APP/.next" "$RUNTIME_FAILED_NEXT"
    mv "$RUNTIME_OLD_NEXT" "$RUNTIME_APP/.next"
  fi
fi

git -C "$LIVE_APP" reset --hard "$OLD_SOURCE_SHA"
test "$(git -C "$LIVE_APP" rev-parse HEAD)" = "$OLD_SOURCE_SHA"
test "$(cat "$LIVE_APP/.next/BUILD_ID")" = "$OLD_BUILD_ID"
test "$(cat "$RUNTIME_APP/.next/BUILD_ID")" = "$OLD_RUNTIME_BUILD_ID"

cd "$LIVE_APP"
npx prisma generate

pm2 restart "$PM2_PROCESS_NAME"
sleep 5

PM2_JSON_FILE="$(mktemp)"
trap 'rm -f "$PM2_JSON_FILE"' EXIT
pm2 jlist > "$PM2_JSON_FILE"
pm2_status="$(node - "$PM2_PROCESS_NAME" "$PM2_JSON_FILE" <<'NODE'
const fs = require('node:fs');
const [name, file] = process.argv.slice(2);
const entry = JSON.parse(fs.readFileSync(file, 'utf8')).find((item) => item.name === name);
if (!entry) process.exit(1);
process.stdout.write(String(entry.pm2_env?.status || ''));
NODE
)"
test "$pm2_status" = "online"

login_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "${PUBLIC_URL%/}/login")"
test "$login_status" = "200"

cat > "$BACKUP_DIR/rollback-evidence.txt" <<EOF
RESTORED_SOURCE_SHA=$OLD_SOURCE_SHA
RESTORED_BUILD_ID=$OLD_BUILD_ID
RUNTIME_APP=$RUNTIME_APP
RESTORED_RUNTIME_BUILD_ID=$OLD_RUNTIME_BUILD_ID
PM2_STATUS=$pm2_status
LOGIN_HTTP=$login_status
FAILED_BUILD_PATH=$FAILED_NEXT
RUNTIME_FAILED_BUILD_PATH=$RUNTIME_FAILED_NEXT
ROLLED_BACK_UTC=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
DATABASE_SCHEMA_ROLLBACK=NOT_ATTEMPTED_ADDITIVE_FLAGS_OFF
EOF
chmod 600 "$BACKUP_DIR/rollback-evidence.txt"
cat "$BACKUP_DIR/rollback-evidence.txt"
printf 'PASS: APPLICATION_ROLLBACK_COMPLETE\n'
