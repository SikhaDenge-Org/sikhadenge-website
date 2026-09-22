# Email production live checkpoint — 2026-09-22

Purpose: force the dedicated Email Automation CI to validate the same reviewed branch that triggers the guarded production checkpoint.

The release action is intentionally limited to:
- one read-only Gmail inbound readiness audit;
- one guarded internal-recipient outbound Email test;
- automatic restoration to DRY_RUN after the internal test.

This checkpoint does not authorize customer/cohort delivery, change lifecycle/campaign/sequence state, widen OAuth scopes, or enable unrestricted external writes.
