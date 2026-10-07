# EngageOS Phases 10–17 — repository exit gates

This document distinguishes repository implementation from production evidence and live activation.

## Phase 10 — AI Brain & Knowledge
- Grounded send gate classifies high-risk factual intents.
- High-risk auto-send requires approved source references.
- Safety, sensitive-content and confidence gates fail closed.
- `ENGAGEOS_GROUNDED_AI_POLICY_ENFORCED` remains false unless explicitly enabled in production.

## Phase 11 — Customer 360
- Customer projection supports channel identities, lead snapshot and ordered timeline.
- Identity merge requires verified/customer-confirmed evidence.
- Merge records are reversible; display-name/username-only merge remains forbidden.

## Phase 12 — Journeys
- Deterministic enrollment, due-step evaluation, quiet hours, consent, suppression, reply/stage cancellation and frequency caps.
- Each journey step has a deterministic idempotency key.

## Phase 13 — Analytics
- Workspace-scoped authoritative metric snapshots.
- Explicit time-window filtering and zero-denominator protection.

## Phase 14 — Official Connectors
- Approved connector catalog and official-API-only activation gate.
- Unofficial scraping/browser automation is rejected as a connector substitute.
- Provider writes require separately approved controlled write evidence.

## Phase 15 — PWA & Productivity
- Service worker registration is wired into the root app.
- Service worker never caches API or non-GET requests.
- Manifest/service-worker/offline/draft/accessibility/push readiness is evaluated separately.

## Phase 16 — SaaS & Enterprise
- SHA-256 API-key storage contract, timing-safe verification, workspace isolation, scopes, plan limits and fixed-window rate-limit gate.
- Existing signed webhook contract remains the outbound enterprise webhook foundation.

## Phase 17 — Controlled Launch
- Release exit gate requires every repository phase implemented plus explicit production evidence.
- Rollout policy still requires exact SHA/build/rollback/monitoring/permissions/policy evidence, zero critical incidents and zero unexplained duplicate sends.
- Promotion cannot skip rollout stages.

## Production boundary
Repository code and CI do not activate Meta writes, connector writes, billing, production database migrations, PM2/Nginx changes, secrets, or production rollout. Those require controlled operational evidence and explicit activation outside this branch.
