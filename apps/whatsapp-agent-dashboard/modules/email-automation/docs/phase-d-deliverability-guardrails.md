# Email Phase D — Deliverability Guardrails

## Scope

Phase D introduced fail-closed safety ceilings for scaled Email Automation delivery. P1 supersedes the original manual evidence source with automated, persisted sender-domain evidence. The safety ceilings and rollout boundary remain unchanged.

This document is retained for historical guardrail context. The current operational source of truth is `P1_AUTOMATED_DELIVERABILITY_EVIDENCE.md`.

`DRY_RUN` and `INTERNAL_RECIPIENTS` remain available for pre-scale certification. Deliverability qualification is mandatory only for `LIMITED_COHORT` and `LIVE`.

## Current P1 evidence contract

Scaled delivery no longer trusts manually asserted SPF/DKIM/DMARC booleans or manually supplied bounce/complaint rate environment values.

The application now:

- verifies sender-domain SPF provider authorization from DNS;
- verifies provider-specific DKIM selector TXT/CNAME evidence from DNS;
- verifies a valid DMARC policy from DNS;
- derives rolling hard-bounce rate from persisted sent messages and structured hard-bounce analytics events;
- persists evidence per connected sender domain;
- requires evidence freshness before scaled delivery;
- requires an authoritative complaint/spam telemetry source before scaled delivery.

If complaint telemetry is unavailable, a zero observed complaint count is **not** treated as authoritative zero complaint rate. Scaled delivery remains fail-closed.

## Safety ceilings

- Hard-bounce rate must remain below `5%`.
- Complaint/spam rate must remain below `0.1%`.
- Equality with either ceiling blocks scaled delivery.

These are safety ceilings, not performance targets.

## Evidence provenance

Authentication evidence is generated from authoritative DNS lookups against the resolved sender domain and provider configuration. Reputation evidence is derived from persisted Email Automation records. Evidence is persisted in the Email connection capability document and must be fresh enough for scaled delivery.

Provider complaint telemetry remains a separate qualification requirement. The runtime does not synthesize or manually override that signal.

## Rollout contract

1. Keep `EMAIL_RUNTIME_MODE=DRY_RUN` and `EMAIL_EXTERNAL_WRITES_ENABLED=false` while P1 evidence is deployed and certified.
2. Keep internal-recipient delivery certification separate from scaled rollout.
3. Before `LIMITED_COHORT`, require fresh persisted sender-domain evidence for the actual resolved sender/provider.
4. If authentication becomes unknown/failed, evidence becomes stale, hard-bounce rate reaches `5%`, complaint telemetry is unavailable/unqualified, or complaint rate reaches `0.1%`, scaled delivery fails closed.
5. `LIVE` remains a separate controlled rollout decision and is never enabled by merging or deploying P1.

## Existing protections retained

The deliverability guard composes with customer consent and suppression checks, RFC 8058 one-click unsubscribe support, campaign frequency caps, provider routing, retry classification, runtime modes, cohort allowlists, and external-write gates. It does not replace those controls.
