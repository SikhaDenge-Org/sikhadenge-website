# Email inbound live readiness trigger

This marker triggers the read-only production Gmail inbound readiness audit. The workflow discovers and verifies the currently deployed runtime identity before probing the pinned support Gmail connection. It does not enable inbound sync and does not widen outbound Email delivery.

Readiness rerun marker: 2026-09-21T23:06+05:30.

Readiness rerun marker: 2026-09-22T00:30+05:30.

Production live checkpoint marker: 2026-09-22. Re-run Gmail inbound readiness and pair it with one guarded internal outbound Email test. Customer/cohort delivery remains locked and the post-test runtime must return to DRY_RUN.
