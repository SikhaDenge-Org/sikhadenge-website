# SikhaDenge Email Automation Engine

Status: canonical module

This folder is the single source of truth for email-specific product and runtime logic inside `apps/whatsapp-agent-dashboard`.

## Boundary rule

New email domain logic, provider adapters, sender management, templates, delivery runtime, automation adapters, inbound sync, campaigns and email analytics MUST live under this module.

Shared platform modules may be consumed through explicit integration points, but email-specific logic must not be scattered through `lib/`, unrelated modules, or page components.

Approved integration points:
- `modules/customers` — customer identity/contact resolution
- `modules/automations` — generic workflow orchestration
- `modules/inbox` — unified conversation surface
- `modules/channels/core` — shared channel/credential primitives where appropriate
- `modules/integrations` — connection health/readiness surface
- `modules/events` — async event processing
- `modules/policy` — consent, suppression and outbound safety
- `modules/analytics` — shared reporting contracts
- `modules/audit` — security/audit events

## Internal layout

- `domain/` — entities, value objects, states and invariants
- `application/` — use cases and orchestration
- `providers/` — Gmail first, then Microsoft 365/other adapters
- `templates/` — template contracts, rendering, assets and approval
- `automation/` — email trigger/action adapters and idempotency
- `messaging/` — outbound queue, retries and send policies
- `inbound/` — watches, threads, replies and provider events
- `campaigns/` — bulk and lifecycle sequence controls
- `analytics/` — email performance/deliverability metrics
- `infrastructure/` — persistence and shared platform adapters
- `ui/` — reusable email-specific UI modules
- `tests/` — email phase tests/fixtures
- `docs/` — phase locks, ADRs and runbooks

## Safety invariant

Merging code never turns unrestricted production email delivery on. Live delivery requires explicit runtime gates, verified sender/domain state, policy checks, idempotency, auditing and a controlled rollout state.
