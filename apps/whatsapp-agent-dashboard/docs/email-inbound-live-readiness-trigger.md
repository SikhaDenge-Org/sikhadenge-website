# Email inbound live readiness trigger

This marker triggers the read-only production Gmail inbound readiness audit. The workflow discovers and verifies the currently deployed runtime identity before probing the pinned support Gmail connection. It does not enable inbound sync and does not widen outbound Email delivery.
