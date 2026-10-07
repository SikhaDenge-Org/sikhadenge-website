# EngageOS Phases 3–17 Execution Lock

Date locked: 2026-09-09
Repository: `maihoonankitsingh/sikhadenge-website`
Application: `apps/whatsapp-agent-dashboard`
Base release SHA: `7ffbfbbde125ad47f022cfad921139c33b00ba0f`
Execution branch: `agent/engageos-phases-3-17-locked-20260909`

## Purpose

This file is the authoritative implementation gate for the remaining EngageOS roadmap. It prevents later product work from being represented as production-complete before its engineering, security, persistence, integration, browser, and controlled-release evidence exists.

## Current verified baseline

- Phase 0 stabilization: complete in repository history.
- Phase 1 omnichannel domain foundation: merged.
- Phase 2 security/persistence foundation: merged.
- Phase 2 production feature activation must be treated as unverified unless current VPS evidence proves each flag independently.
- Release-branch source and actual VPS source must never be assumed identical without a read-only production check.

## Status vocabulary

- `LOCKED`: scope and exit criteria are fixed.
- `FOUNDATION_IMPLEMENTED`: reusable domain/application code and tests exist, but full phase exit gate is not yet proven.
- `INTEGRATION_PENDING`: external platform, persistence, worker, UI, or production evidence is still required.
- `PRODUCTION_READY`: all documented exit gates pass in CI/staging and controlled real-account tests where applicable.
- `LIVE`: exact deployed SHA/build/configuration has post-deploy evidence.

A phase may not be called `LIVE` merely because code exists on a GitHub branch.

## Locked execution order

| Phase | Scope | Repository target | Production gate |
|---|---|---|---|
| 3 | Durable event runtime, idempotency, retry, dead-letter, replay | `modules/events`, `workers`, queue adapters | duplicate/retry/DLQ/replay evidence |
| 4 | Integration Control Centre | `modules/integrations`, integration UI/API | verified connection health, revoke/disconnect tests |
| 5 | Unified Inbox 2.0 | `modules/inbox`, inbox UI/API | channel-neutral authenticated browser suite |
| 6 | WhatsApp omnichannel migration | `modules/channels/whatsapp` | parity/backfill/rollback evidence |
| 7 | Instagram comments + DM | `modules/channels/instagram` | controlled real professional-account flow |
| 8 | Facebook comments + Messenger | `modules/channels/facebook`, `modules/channels/messenger` | controlled real Page/Messenger flow |
| 9 | Visual Automation Builder | `modules/automations` | graph compile/simulate/version/rollback parity |
| 10 | AI Brain + Knowledge Intelligence | `modules/ai`, `modules/knowledge` | benchmark, provenance, confidence/handoff gates |
| 11 | Customer 360 + identity graph | `modules/customers`, `modules/crm` | reversible evidence-based merge tests |
| 12 | Journeys/campaign lifecycle | `modules/journeys`, `modules/campaigns` | cancel/suppress/frequency/schedule tests |
| 13 | Analytics + AI Command Centre | `modules/analytics` | metric reconciliation to authoritative events |
| 14 | Additional official connectors | `modules/channels/*` | official capability/permission/quota verification |
| 15 | PWA + counselor productivity | app/UI/shared | install/offline/accessibility/performance evidence |
| 16 | SaaS/agency/enterprise readiness | workspaces/billing/public API | tenant, usage, scope, billing reconciliation |
| 17 | Controlled production launch | rollout/release tooling | staged rollout + rollback + no critical incident |

## Non-negotiable gates

1. No destructive migration.
2. No direct production commit.
3. No fake connected status without provider evidence.
4. No unsupported outbound action exposed as enabled.
5. No unrestricted AI auto-send.
6. No automatic identity merge based only on display name or username.
7. No unofficial scraping substitute for required official APIs.
8. No webhook route may perform long-running campaign/AI processing synchronously once Phase 3 runtime is active.
9. Every automatic outbound path must pass consent, suppression, permission, capability, and kill-switch checks.
10. Every production activation requires exact SHA, rollback point, smoke evidence, and explicit feature activation.

## Implementation batches

### Batch A — Foundations

Phases 3–4. Durable event processing and trustworthy integration state must exist before expanding channel automation.

### Batch B — Core omnichannel product

Phases 5–9. Unified Inbox, WhatsApp migration, Instagram/Facebook/Messenger and the versioned automation runtime.

### Batch C — Intelligence and business operations

Phases 10–13. Controlled AI, identity graph, journeys and authoritative analytics.

### Batch D — Expansion and commercial readiness

Phases 14–16. Official connectors, productivity/PWA and multi-tenant commercial controls.

### Batch E — Release

Phase 17. Controlled progressive activation only after all preceding production gates relevant to the selected rollout scope are green.

## Completion rule

Repository code added by this branch establishes implementation foundations. A phase is only marked complete after its original `PHASES.md` exit gate has test and deployment evidence. This protects the current working WhatsApp system from premature activation while allowing the remaining architecture to be implemented additively.