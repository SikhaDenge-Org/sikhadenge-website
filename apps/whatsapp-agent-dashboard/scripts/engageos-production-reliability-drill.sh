#!/usr/bin/env bash
set -Eeuo pipefail

APP="/var/www/sikhadenge-whatsapp-agent/source/apps/whatsapp-agent-dashboard"
PROD_NAME="sikhadenge-whatsapp-agent"
PROBE_NAME="sikhadenge-reliability-probe-$$"
PROBE_JS="/tmp/$PROBE_NAME.js"

cleanup() {
  pm2 delete "$PROBE_NAME" >/dev/null 2>&1 || true
  rm -f "$PROBE_JS"
}
trap cleanup EXIT

pm2_status() {
  pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const name=process.argv[1];const p=JSON.parse(s||"[]").find(x=>x.name===name);process.stdout.write(String(p?.pm2_env?.status||"missing"))})' "$1"
}

test "$(pm2_status "$PROD_NAME")" = "online"
login_http="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3100/login)"
test "$login_http" = "200"

cat > "$PROBE_JS" <<'NODE'
setInterval(() => {}, 1000);
NODE

pm2 start "$PROBE_JS" --name "$PROBE_NAME" --time >/dev/null
sleep 1

before_json="$(pm2 jlist)"
before_pid="$(printf '%s' "$before_json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const n=process.argv[1];const p=JSON.parse(s||"[]").find(x=>x.name===n);if(!p)process.exit(2);process.stdout.write(String(p.pid||""))})' "$PROBE_NAME")"
before_restarts="$(printf '%s' "$before_json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const n=process.argv[1];const p=JSON.parse(s||"[]").find(x=>x.name===n);if(!p)process.exit(2);process.stdout.write(String(p.pm2_env?.restart_time||0))})' "$PROBE_NAME")"

test -n "$before_pid"
start_ms="$(node -e 'process.stdout.write(String(Date.now()))')"
kill -9 "$before_pid"

recovered=false
after_restarts="$before_restarts"
for _ in $(seq 1 40); do
  sleep 0.25
  after_json="$(pm2 jlist)"
  status="$(printf '%s' "$after_json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const n=process.argv[1];const p=JSON.parse(s||"[]").find(x=>x.name===n);process.stdout.write(String(p?.pm2_env?.status||"missing"))})' "$PROBE_NAME")"
  after_restarts="$(printf '%s' "$after_json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const n=process.argv[1];const p=JSON.parse(s||"[]").find(x=>x.name===n);process.stdout.write(String(p?.pm2_env?.restart_time||0))})' "$PROBE_NAME")"
  if [[ "$status" == "online" && "$after_restarts" -gt "$before_restarts" ]]; then
    recovered=true
    break
  fi
done

test "$recovered" = "true"
end_ms="$(node -e 'process.stdout.write(String(Date.now()))')"
pm2_recovery_ms="$(( end_ms - start_ms ))"

cd "$APP"
set +e
DATABASE_URL='postgresql://invalid:invalid@127.0.0.1:1/invalid?connect_timeout=1'   npx prisma migrate status >/tmp/phase20-db-failure.out 2>&1
db_rc=$?
set -e
test "$db_rc" -ne 0
grep -q 'P1001' /tmp/phase20-db-failure.out
grep -q '127.0.0.1:1' /tmp/phase20-db-failure.out
db_failure_sha256="$(sha256sum /tmp/phase20-db-failure.out | awk '{print $1}')"

test "$(pm2_status "$PROD_NAME")" = "online"
login_http_after="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3100/login)"
test "$login_http_after" = "200"

printf 'PHASE20_PM2_PROBE_RECOVERY_MS=%s\n' "$pm2_recovery_ms"
printf 'PHASE20_PM2_PROBE_RESTARTS_BEFORE=%s\n' "$before_restarts"
printf 'PHASE20_PM2_PROBE_RESTARTS_AFTER=%s\n' "$after_restarts"
printf 'PHASE20_DB_FAILURE_EXIT_CODE=%s\n' "$db_rc"
printf 'PHASE20_DB_FAILURE_SIGNATURE=P1001_127.0.0.1:1\n'
printf 'PHASE20_DB_FAILURE_OUTPUT_SHA256=%s\n' "$db_failure_sha256"
printf 'PHASE20_PRODUCTION_LOGIN_HTTP_BEFORE=%s\n' "$login_http"
printf 'PHASE20_PRODUCTION_LOGIN_HTTP_AFTER=%s\n' "$login_http_after"
printf 'PASS: PM2_SYNTHETIC_CRASH_RECOVERY_VERIFIED\n'
printf 'PASS: INVALID_DATABASE_URL_FAIL_CLOSED_VERIFIED\n'
printf 'PASS: PRODUCTION_PROCESS_UNAFFECTED_VERIFIED\n'
printf 'PASS: PHASE20_RELIABILITY_DRILL_VERIFIED\n'

