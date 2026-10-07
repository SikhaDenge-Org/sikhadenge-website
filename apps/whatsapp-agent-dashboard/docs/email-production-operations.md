# Email Production Operations

Email production workflows support two audited trigger modes: protected release push markers and manual exact-SHA dispatch.

Manual dispatch requires an explicit `deployed_sha`; the workflow validates that the production checkout exactly matches that SHA before any audit or controlled action.

Staged promotion order remains: inbound readiness, inbound activation when authorized, internal canary, limited cohort, lifecycle readiness/provision/approval, then final LIVE promotion only after evidence is green.

Production batch evidence collection uses bounded SSH connection attempts so host/network outages fail fast.
