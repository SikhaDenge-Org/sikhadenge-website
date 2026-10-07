# SikhaDenge EngageOS

EngageOS is the planned evolution of `whatsapp.sikhadenge.in` into an owned omnichannel engagement platform for comments, direct messages, AI conversations, CRM, automations, campaigns, analytics, and human counselor operations.

## Scope

This documentation applies only to:

```text
apps/whatsapp-agent-dashboard
```

It does not authorize changes to unrelated applications, domains, repositories, infrastructure, production branches, or VPS services.

## Current execution status

- Canonical release branch: `release/whatsapp-instagram-agent-flow-20260731`
- Phase 0 production SHA: `a17a92761bebc93eea76c7c443933b5a0c3443e3`
- Phase 0 build ID: `9uuYV4kVWB0HoeRWv25kX`
- Phase 0: stabilization and source-of-truth gate complete
- Active repository phase: Phase 1 — omnichannel domain foundation
- Production database/schema in Phase 0: unchanged
- Next implementation rule: additive contracts first; existing WhatsApp behavior remains unchanged

## Locked engineering direction

1. Keep the product as a modular monolith until measured scale requires extraction.
2. Separate platform adapters from business logic.
3. Normalize all inbound platform activity into channel-neutral events.
4. Keep automation, CRM, Inbox, AI, knowledge, analytics, and integrations as explicit modules.
5. Use additive, rollback-safe database migrations.
6. Keep all new behavior behind feature flags until validated.
7. Require tests, auditability, policy enforcement, and kill switches before automatic outbound messaging.
8. Never merge, deploy, or migrate production as part of documentation-only work.

## Documentation map

| File | Purpose |
|---|---|
| `ARCHITECTURE.md` | Target system architecture, boundaries, dependency rules, runtime flow, security, and observability. |
| `FILE_STRUCTURE.md` | Locked target folder structure and ownership of every major file group. |
| `PHASES.md` | Phase-by-phase execution roadmap with deliverables and completion gates. |
| `PHASE_0_CHECKLIST.md` | Original execution checklist for stabilization and truth reconciliation. |
| `PHASE_0_COMPLETION.md` | Verified GitHub, VPS, CI, rollback, build, and production evidence used to close Phase 0. |
| `MIGRATION_MAP.md` | Safe migration from the current WhatsApp-centric code and Prisma schema to the omnichannel model. |
| `ENGINEERING_STANDARDS.md` | Branching, pull requests, code quality, API, database, test, security, and release rules. |
| `adr/0001-modular-monolith.md` | Architecture decision record for starting with a modular monolith. |

## Phase rule

Only one phase may be active at a time. A phase is complete only when its documented exit gate is satisfied with repository evidence. Starting the next phase does not imply production deployment.

## Product capability order

```text
Stabilize existing application
  -> establish omnichannel domain core
  -> security and event runtime
  -> integration control centre
  -> unified Inbox
  -> WhatsApp migration
  -> Instagram comment and DM automation
  -> Facebook and Messenger
  -> visual automation builder
  -> AI and knowledge controls
  -> Customer 360 CRM
  -> journeys and campaigns
  -> analytics
  -> additional channels
  -> PWA and SaaS readiness
```

## Non-negotiable restrictions

- No direct commits to the live production branch.
- No direct Prisma destructive migration.
- No platform-specific API logic inside generic CRM, Inbox, or automation modules.
- No automatic customer identity merge based only on names or usernames.
- No unrestricted AI auto-send.
- No unofficial scraping when an official API and permission model is required.
- No fake UI status that claims a channel is connected without a verified transport.
- No webhook handler performing long-running AI or campaign work synchronously.
- No automation flow publishing without validation, versioning, and rollback.
