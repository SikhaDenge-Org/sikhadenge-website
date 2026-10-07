#!/usr/bin/env bash
set -Eeuo pipefail

: "${LIVE_APP:?LIVE_APP is required}"
: "${STAGE_APP:?STAGE_APP is required}"
: "${RELEASE_SHA:?RELEASE_SHA is required}"

ENV_FILE="${ENV_FILE:-${LIVE_APP}/.env}"
WORKSPACE_ID="${ENGAGEOS_STAGE1_WORKSPACE_ID:-engagews_default}"

read_env_value() {
  local key="$1" file="$2"
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
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) value = value.slice(1, -1);
  process.stdout.write(value);
  process.exit(0);
}
process.exit(1);
NODE
}

test "$WORKSPACE_ID" = "engagews_default"
test "$(git -C "$LIVE_APP" rev-parse HEAD)" = "$RELEASE_SHA"
test "$(git -C "$STAGE_APP" rev-parse HEAD)" = "$RELEASE_SHA"
test -f "$ENV_FILE"

DATABASE_URL="$(read_env_value DATABASE_URL "$ENV_FILE")"
export DATABASE_URL
export ENGAGEOS_STAGE1_WORKSPACE_ID="$WORKSPACE_ID"
export ENGAGEOS_STAGE1_RELEASE_SHA="$RELEASE_SHA"

cd "$STAGE_APP"
npx prisma validate >/dev/null
npx tsx scripts/engageos-phase17-stage1-bootstrap.ts

printf 'PASS: PHASE17_STAGE1_BOOTSTRAP_WRAPPER_COMPLETE\n'
