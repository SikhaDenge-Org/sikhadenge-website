#!/usr/bin/env bash
# Production trigger marker: Page 01 supplied-reference fidelity deploy — 2026-09-12 v2
# Production Batch 1 authorization marker — 2026-09-14 canonical release deploy
# Production Batch 1 retry marker — 2026-09-14 after verified V17 drift reconciliation
# Production Batch 1 final canonical trigger — 2026-09-14 after atomic runtime repair
set -Eeuo pipefail

: "${LIVE_APP:?LIVE_APP is required}"
: "${STAGE_APP:?STAGE_APP is required}"
: "${RELEASE_SHA:?RELEASE_SHA is required}"
: "${RUN_ID:?RUN_ID is required}"

BACKUP_ROOT="${BACKUP_ROOT:-/root/sikhadenge-backups}"
BACKUP_DIR="${BACKUP_ROOT}/engageos-${RUN_ID}"
ENV_FILE="${ENV_FILE:-${LIVE_APP}/.env}"

read_env_value() {
  local key="$1"
  local file="$2"
  node - "$file" "$key" <<'NODE'
const fs = require('node:fs');
const [file, key] = process.argv.slice(2);
if (!file || !key || !fs.existsSync(file)) process.exit(1);
const text = fs.readFileSync(file, 'utf8');
for (const rawLine of text.split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
  const separator = normalized.indexOf('=');
  if (separator < 1 || normalized.slice(0, separator).trim() !== key) continue;
  let value = normalized.slice(separator + 1).trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1);
  }
  process.stdout.write(value);
  process.exit(0);
}
process.exit(1);
NODE
}

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

test -f "$ENV_FILE"
DATABASE_URL="$(read_env_value DATABASE_URL "$ENV_FILE")"
DATABASE_CLI_URL="$(node "$STAGE_APP/scripts/prisma-postgres-cli-url.mjs" "$DATABASE_URL")"

OLD_SOURCE_SHA="$(git -C "$LIVE_APP" rev-parse HEAD)"
OLD_BUILD_ID="$(cat "$LIVE_APP/.next/BUILD_ID")"

printf '%s\n' "$OLD_SOURCE_SHA" > "$BACKUP_DIR/source-before.sha"
printf '%s\n' "$OLD_BUILD_ID" > "$BACKUP_DIR/build-before.id"
printf '%s\n' "$RELEASE_SHA" > "$BACKUP_DIR/release-target.sha"
pm2 describe sikhadenge-whatsapp-agent > "$BACKUP_DIR/pm2-before.txt"
git -C "$LIVE_APP" status --short > "$BACKUP_DIR/worktree-before.txt"

DUMP_FILE="$BACKUP_DIR/database.dump"
pg_dump --format=custom --no-owner --no-privileges "$DATABASE_CLI_URL" > "$DUMP_FILE"
test -s "$DUMP_FILE"
pg_restore --list "$DUMP_FILE" > "$BACKUP_DIR/database.list"
test -s "$BACKUP_DIR/database.list"
sha256sum "$DUMP_FILE" > "$BACKUP_DIR/database.dump.sha256"
sha256sum "$BACKUP_DIR/database.list" > "$BACKUP_DIR/database.list.sha256"

cat > "$BACKUP_DIR/manifest.txt" <<EOF
RUN_ID=$RUN_ID
RELEASE_SHA=$RELEASE_SHA
OLD_SOURCE_SHA=$OLD_SOURCE_SHA
OLD_BUILD_ID=$OLD_BUILD_ID
DATABASE_DUMP=$DUMP_FILE
DATABASE_DUMP_SHA256=$(awk '{print $1}' "$BACKUP_DIR/database.dump.sha256")
CREATED_UTC=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
EOF

chmod 600 "$BACKUP_DIR"/*
printf 'BACKUP_DIR=%s\n' "$BACKUP_DIR"
printf 'OLD_SOURCE_SHA=%s\n' "$OLD_SOURCE_SHA"
printf 'OLD_BUILD_ID=%s\n' "$OLD_BUILD_ID"
printf 'DATABASE_DUMP_SHA256=%s\n' "$(awk '{print $1}' "$BACKUP_DIR/database.dump.sha256")"
printf 'PASS: VERIFIED_DATABASE_BACKUP_CREATED\n'
