#!/usr/bin/env bash
set -Eeuo pipefail

verify_script="scripts/engageos-production-verify.sh"
rollback_script="scripts/engageos-production-rollback.sh"

for script_path in "$verify_script" "$rollback_script"; do
  test -f "$script_path"
  bash -n "$script_path"
  grep -Fq 'PM2_JSON_FILE="$(mktemp)"' "$script_path"
  grep -Fq 'pm2 jlist > "$PM2_JSON_FILE"' "$script_path"
  grep -Fq "fs.readFileSync(file, 'utf8')" "$script_path"

  if grep -Fq 'pm2_json="$(pm2 jlist)"' "$script_path"; then
    printf 'PM2 JSON must not be captured into a shell variable for argv transport: %s\n' "$script_path" >&2
    exit 1
  fi

  if grep -Eq 'node[[:space:]]+-[[:space:]]+"\$PM2_PROCESS_NAME"[[:space:]]+"\$pm2_json"' "$script_path"; then
    printf 'PM2 JSON must not be passed to Node through argv: %s\n' "$script_path" >&2
    exit 1
  fi
done

grep -Fq "const [name, file] = process.argv.slice(2);" "$verify_script"
grep -Fq 'pm2_unstable' "$verify_script"
grep -Fq 'pm2_restarts' "$verify_script"
grep -Fq "const [name, file] = process.argv.slice(2);" "$rollback_script"
grep -Fq 'PASS: POST_DEPLOY_VERIFICATION_COMPLETE' "$verify_script"
grep -Fq 'PASS: APPLICATION_ROLLBACK_COMPLETE' "$rollback_script"

printf 'EngageOS production PM2 jlist file-transport policy test passed.\n'
