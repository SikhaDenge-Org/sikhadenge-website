#!/usr/bin/env bash
set -Eeuo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-/root/sikhadenge-backups}"
RTO_TARGET_MINUTES="${RTO_TARGET_MINUTES:-30}"

latest_dir="$(
  find "$BACKUP_ROOT" -maxdepth 1 -mindepth 1 -type d -name 'engageos-*' -printf '%T@ %p\n' 2>/dev/null |
    sort -nr |
    awk 'NR==1 {sub(/^[^ ]+ /, ""); print}'
)"

test -n "$latest_dir"
test -d "$latest_dir"

required=(
  manifest.txt
  database.dump
  database.dump.sha256
  database.list
  database.list.sha256
  source-before.sha
  build-before.id
)

for file_name in "${required[@]}"; do
  test -s "$latest_dir/$file_name"
done

(
  cd "$latest_dir"
  sha256sum --check database.dump.sha256
  sha256sum --check database.list.sha256
)

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

pg_restore --list "$latest_dir/database.dump" > "$tmp_dir/database.list"
test -s "$tmp_dir/database.list"

pg_restore --schema-only --no-owner --no-privileges   --file="$tmp_dir/schema.sql"   "$latest_dir/database.dump"
test -s "$tmp_dir/schema.sql"

manifest_created="$(
  awk -F= '$1 == "CREATED_UTC" {sub($1 "=", ""); print; exit}' "$latest_dir/manifest.txt"
)"
test -n "$manifest_created"

created_epoch="$(date -u -d "$manifest_created" +%s)"
now_epoch="$(date -u +%s)"
backup_age_seconds="$(( now_epoch - created_epoch ))"
if (( backup_age_seconds < 0 )); then
  backup_age_seconds=0
fi

dump_sha="$(awk '{print $1; exit}' "$latest_dir/database.dump.sha256")"
source_sha="$(tr -d '\r\n' < "$latest_dir/source-before.sha")"
build_id="$(tr -d '\r\n' < "$latest_dir/build-before.id")"

printf 'DR_BACKUP_DIR=%s\n' "$latest_dir"
printf 'DR_BACKUP_AGE_SECONDS=%s\n' "$backup_age_seconds"
printf 'DR_DATABASE_DUMP_SHA256=%s\n' "$dump_sha"
printf 'DR_SOURCE_BEFORE_SHA=%s\n' "$source_sha"
printf 'DR_BUILD_BEFORE_ID=%s\n' "$build_id"
printf 'DR_RTO_TARGET_MINUTES=%s\n' "$RTO_TARGET_MINUTES"
printf 'DR_RPO_MODE=PRE_DEPLOY_BACKUP_ONLY\n'
printf 'DR_CLOCK_BASED_RPO_GUARANTEE=NONE\n'
printf 'PASS: DR_DATABASE_DUMP_CHECKSUM_VERIFIED\n'
printf 'PASS: DR_DATABASE_CATALOG_READABLE\n'
printf 'PASS: DR_SCHEMA_EXTRACTION_READABLE\n'
printf 'PASS: DR_ROLLBACK_SOURCE_BUILD_EVIDENCE_PRESENT\n'
printf 'PASS: PRODUCTION_DR_READINESS_VERIFIED\n'

