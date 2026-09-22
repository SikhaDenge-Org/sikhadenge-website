# Phase22D refresh-then-live internal canary

This control-plane path preserves the 30-minute freshness gate instead of relaxing it.

On the same protected-release merge push:
1. the Phase22D refresh workflow supersedes the exact stale queued INTERNAL_TEST canary and queues one fresh `hello_world` canary;
2. the refresh workflow runs the existing single-message operator in DRY_RUN and records the fresh message ID in issue #65;
3. the one-time live dispatcher waits for that exact same-commit refresh run, resolves its fresh message ID, and immediately invokes the existing reviewed single-message operator with `execute=true`;
4. the target operator requires the exact designated INTERNAL_TEST recipient, exact active ADMIN approver, state version 2, scheduler isolation, provider parity, one-time persisted approval, and isolated live provider gates;
5. the operator restores controlled launch to SHADOW / NO_EXTERNAL_WRITES and final verification accepts only a clean checkout or the sole reviewed email-only drift with an exact protected-release SHA-256 match.

The dispatcher itself contains no Meta provider call and does not enable batch/general outbound or mutate PM2/.env.
Retry note: the protected-release retry preserves the existing 30-minute freshness threshold; it changes no provider or runtime authorization logic.
