# E8 — Multi-Provider Contract Parity & Production Readiness

Scope completed by this phase:

- Gmail and Microsoft 365 remain behind the same `EmailProviderAdapter` contract.
- Provider dispatch routing validates sender, workspace, connection status, provider identity and registered adapter before selection.
- Provider failover is opt-in through `EMAIL_PROVIDER_FAILOVER_ENABLED=true`; disabled is the default behavior.
- Provider failover order is controlled by `EMAIL_PROVIDER_FAILOVER_ORDER` and fails closed when an ordered provider is unavailable, unregistered, disconnected, cross-workspace, inactive or unverified.
- Manual and automation template/content contracts remain provider-neutral; provider switching does not rewrite templates or automation definitions.
- Existing retry behavior remains pinned to the original persisted sender and connection; E8 does not silently reroute an explicit retry.
- Gmail and Microsoft adapters run through a shared contract parity suite.
- Production readiness can be inspected with `scripts/email-provider-e8-readiness.ts` without printing credential values or making provider network calls.

## E8 production safety gate

E8 production readiness is intentionally non-sending. A passing readiness probe requires:

- `EMAIL_RUNTIME_ENABLED=true`
- `EMAIL_RUNTIME_MODE=DRY_RUN`
- `EMAIL_EXTERNAL_WRITES_ENABLED=false`
- Gmail provider configuration present
- if provider failover is enabled, every ordered failover provider must be configured

The readiness probe always emits `E8_EXTERNAL_EMAIL_SENT=false` and does not authorize customer delivery.

## Contract evidence

- `tests/provider-contract-parity.test.ts`
- `tests/provider-routing.test.ts`
- `tests/provider-readiness.test.ts`
- Email Automation CI runs all three E8 gates plus the existing Email suite and application typecheck.

## Deferred provider expansion

Brevo, Amazon SES and Resend remain domain-contract options only. They are not registered as runtime adapters by this phase. Adding any of them requires the same shared provider contract suite and a separate production credential/readiness review.
