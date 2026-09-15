#!/usr/bin/env bash
set -Eeuo pipefail
activate="scripts/email-automation-scheduler-activate.sh"
deactivate="scripts/email-automation-scheduler-deactivate.sh"
for f in "$activate" "$deactivate"; do test -f "$f"; bash -n "$f"; done

grep -Fq 'APPLY="${APPLY:-0}"' "$activate"
grep -Fq 'preview only; no systemd files written' "$activate"
grep -Fq 'APPLY=1 requires root' "$activate"
grep -Fq 'email-automation-production-preflight.sh' "$activate"
grep -Fq 'systemctl enable --now' "$activate"
grep -Fq 'NoNewPrivileges=true' "$activate"
grep -Fq 'ProtectSystem=strict' "$activate"
grep -Fq 'Persistent=true' "$activate"

grep -Fq 'APPLY="${APPLY:-0}"' "$deactivate"
grep -Fq 'preview only; no mutation performed' "$deactivate"
grep -Fq 'systemctl disable --now' "$deactivate"
grep -Fq 'rm -f "$timer_path" "$unit_path"' "$deactivate"

if grep -Fq 'EMAIL_RUNTIME_MODE=LIVE' "$activate" || grep -Fq 'EMAIL_EXTERNAL_WRITES_ENABLED=true' "$activate"; then
  printf 'Activation script must not enable live/external email delivery.\n' >&2
  exit 1
fi
printf 'Email automation scheduler activation policy: PASS\n'