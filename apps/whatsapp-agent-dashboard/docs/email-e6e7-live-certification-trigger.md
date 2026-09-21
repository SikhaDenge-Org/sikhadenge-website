# Email E6/E7 live certification trigger

This marker triggers the guarded production readiness workflow. The workflow discovers the exact deployed application SHA over the pinned production SSH channel before performing scheduler and E6/E7 readiness checks. It does not send customer email or mutate Email runtime state.

Diagnostic rerun marker: 2026-09-21 runtime identity gate.

Evidence discovery hardening rerun marker: 2026-09-21.

Canonical engageos production-evidence path rerun marker: 2026-09-21.

PM2 identity read newline rerun marker: 2026-09-21.
