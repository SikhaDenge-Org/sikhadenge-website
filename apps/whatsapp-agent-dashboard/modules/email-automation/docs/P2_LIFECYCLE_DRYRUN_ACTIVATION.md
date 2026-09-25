# P2 Lifecycle DRY_RUN Activation

This phase activates the five SikhaDenge lifecycle Email Automation flows only under the production DRY_RUN guard.

Production invariants:

- exact deployed source SHA must match the pinned Email P1 production lineage;
- `EMAIL_RUNTIME_MODE=DRY_RUN`;
- Email runtime and automation enabled;
- `EMAIL_EXTERNAL_WRITES_ENABLED` must not be true;
- Email scheduler timer enabled and active;
- source tree tracked files clean before and after;
- support@sikhadenge.in must remain connected, active, verified, and the workspace default sender;
- five lifecycle templates and five lifecycle flows must exist;
- reviewed templates must be approved and flow template/sender/purpose pins valid before activation;
- the marketing lifecycle flow must preserve the required unsubscribe contract;
- activation must produce five ACTIVE flows with `externalRequestSent=false`;
- a second activation pass must prove idempotency with five already-active flows and zero newly activated flows;
- scaled customer delivery remains disabled.

The production control is intentionally fail-closed. It does not enable LIMITED_COHORT or LIVE and does not authorize external customer Email delivery.
