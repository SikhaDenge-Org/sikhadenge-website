# Email Phase D — Deliverability Guardrails

## Scope

Phase D prevents scaled Email Automation delivery from moving into `LIMITED_COHORT` or `LIVE` unless authentication and reputation evidence are positively qualified. It does not enable customer delivery and it does not weaken the existing runtime, allowlist, consent, suppression, idempotency, or provider-routing gates.

`DRY_RUN` and `INTERNAL_RECIPIENTS` remain available for pre-scale certification. The deliverability guard becomes mandatory only when Email Automation attempts scaled external delivery.

## Required runtime evidence for LIMITED_COHORT or LIVE

The following environment values must be populated by the production qualification process before scaled delivery can pass:

- `EMAIL_DELIVERABILITY_SPF_ALIGNED=true`
- `EMAIL_DELIVERABILITY_DKIM_ALIGNED=true`
- `EMAIL_DELIVERABILITY_DMARC_ALIGNED=true`
- `EMAIL_DELIVERABILITY_HARD_BOUNCE_RATE_PCT=<0..100>`
- `EMAIL_DELIVERABILITY_COMPLAINT_RATE_PCT=<0..100>`

Missing, malformed, false, failed, misaligned, or unverified authentication evidence fails closed.

## Safety ceilings

- Hard-bounce rate must remain below `5%`.
- Complaint/spam rate must remain below `0.1%`.
- Equality with either ceiling blocks scaled delivery.

These are safety ceilings, not performance targets. Operators should alarm before the ceiling and keep complaint/spam rates materially lower.

## Evidence provenance

The guard accepts operational evidence; it does not claim that environment values independently prove DNS or mailbox-provider state. The production qualification procedure must populate these values from authoritative domain-authentication checks and current reputation telemetry. Do not manually mark authentication as aligned without verifying the active sending domain and provider configuration.

## Rollout contract

1. Keep `EMAIL_RUNTIME_MODE=DRY_RUN` and `EMAIL_EXTERNAL_WRITES_ENABLED=false` while configuring and validating evidence.
2. Complete internal-recipient delivery certification separately.
3. Before `LIMITED_COHORT`, populate all five deliverability evidence values and verify the Phase D contract tests.
4. If any authentication signal becomes unknown/failed, hard-bounce rate reaches `5%`, complaint/spam rate reaches `0.1%`, or telemetry becomes unavailable, scaled Email Automation delivery fails closed.
5. `LIVE` remains a separate controlled rollout decision and is never enabled by merging Phase D.

## Existing protections retained

Phase D composes with existing customer consent and suppression checks, RFC 8058 one-click unsubscribe support, campaign frequency caps, provider routing, retry classification, runtime modes, and external-write gates. It does not replace those controls.
