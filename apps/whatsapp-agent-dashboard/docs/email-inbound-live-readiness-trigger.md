# Email inbound live readiness trigger

This marker triggers the read-only production Gmail inbound readiness audit. The workflow discovers and verifies the currently deployed runtime identity before probing the pinned support Gmail connection. It does not enable inbound sync and does not widen outbound Email delivery.

Readiness rerun marker: 2026-09-21T23:06+05:30.

Readiness rerun marker: 2026-09-22T00:30+05:30.

Production live checkpoint marker: 2026-09-22. Re-run Gmail inbound readiness and pair it with one guarded internal outbound Email test. Customer/cohort delivery remains locked and the post-test runtime must return to DRY_RUN.

## Phase A — Truth & Safety checkpoint — 2026-09-23

Protected release SHA used for the refreshed Phase A checkpoint: `ee21990590cd3db2ca9581b7178814050d2e8e3f`.

This checkpoint intentionally performs no customer/cohort send. On merge to the protected release branch it re-runs the existing read-only Gmail inbound readiness audit. The merge commit is also intended to carry the existing `[email-dryrun-activate]` and `[email-operational-validation]` guarded markers so production is reconciled to verified DRY_RUN, external Email writes remain disabled, scheduler/runtime identity is re-verified, and the previously persisted internal Email canary is checked for idempotent replay without a new external send.

Phase A exit evidence must show:

- production runtime/build identity is internally consistent;
- Email runtime is `DRY_RUN`;
- unrestricted external Email writes are disabled;
- scheduler state is verified and duplicate scheduler wiring is rejected;
- persisted internal-canary idempotency replay does not create a duplicate message record;
- Gmail inbound readiness executes read-only and reports explicit blockers rather than widening scopes or enabling inbound sync;
- any failed activation/reconciliation returns Email to fail-closed DRY_RUN state.

This checkpoint does not authorize `LIMITED_COHORT` or `LIVE` customer delivery.
