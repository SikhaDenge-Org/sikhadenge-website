# Phase22D refresh preflight observability

The stale-canary refresh remains fail-closed. Before any message-state mutation it now records non-secret evidence for:

- deployed Git SHA and tracked-dirty count,
- WhatsApp PM2 process state,
- login HTTP readiness with a bounded retry,
- outbound/cutover/kill-switch booleans,
- automation scheduler outbound/mode/kill-switch runtime values.

The workflow still fails before queueing if any gate is unsafe. No provider send path is added.
