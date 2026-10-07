# Phase 16 — SaaS, Agency and Enterprise Readiness Execution Lock

## Baseline

- Release base: `69671012285ba699c7f1e8d353662ea7fd90fafa`
- Production live baseline remains independently pinned to Phase 15 and is not part of this implementation branch.
- Phase 16 repository work MUST NOT deploy production, run production migrations, modify PM2/Nginx, alter secrets, activate billing, enable provider writes, or change protected production stashes.

## Audit findings that define the gap

Repository-level Phase 16 contracts already exist for:

- tenant scope checking
- plan limit checking
- SHA-256 API-key hashing
- timing-safe API-key verification
- API scopes
- fixed-window rate-limit decisions
- HMAC-SHA256 outbound webhook signing and verification

The production/release audit found that the persistence and commercial control-plane layer is still incomplete. The current Prisma schema has no dedicated persistence models for public API keys, SaaS plans, workspace usage metering, billing/account state, agency parent/client relationships, white-label configuration, custom domains, or developer request logs.

The existing `modules/release/application/phase-readiness.ts` also marks repository implementation as complete without verifying Phase 16 persistence/runtime evidence. Phase 16 completion therefore requires explicit evidence rather than relying on that boolean alone.

## Locked implementation sequence

Only one subphase may be active at a time.

### Phase 16A — Tenant and persistence foundation

Deliver additive persistence contracts for:

- workspace agency parent/client relationship
- workspace SaaS plan state
- public API-key metadata with SHA-256 digest only; never raw key persistence
- workspace usage events with deterministic idempotency keys
- white-label configuration
- custom-domain verification state
- developer/API request logs

Requirements:

- additive Prisma migration only
- no destructive column/table operations
- all tenant-owned rows carry `workspaceId`
- foreign keys use tenant-safe relationships
- no secret plaintext in schema
- API-key raw secret may only exist transiently at creation time and must never be recoverable from persistence
- usage events must be idempotent
- custom-domain hostname must be globally unique
- agency hierarchy must not allow cross-workspace data access by itself

Exit gate:

- Prisma validation/generation passes
- migration regression passes
- schema policy tests prove required tenant ownership/indexes
- no production migration executed

### Phase 16B — Scoped public API-key runtime

Deliver:

- database-backed API-key create/list/revoke contracts
- generated raw secret returned only once
- stored SHA-256 digest and non-sensitive prefix only
- timing-safe verification
- workspace binding
- required-scope enforcement
- revoked/expired keys fail closed
- rate-limit state adapter
- security audit/developer log entries

Exit gate:

- cross-workspace key use denied
- revoked and expired keys denied
- missing scope denied
- raw key is not persisted or returned by list/read paths
- deterministic unit/integration tests pass

### Phase 16C — Plans, seats, usage and billing data

Deliver:

- plan catalogue identifiers and workspace subscription state
- seat/connection/monthly-outbound limits
- usage aggregation from authoritative usage events
- billing-period boundaries
- reconciliation contract for usage totals
- explicit billing-provider-neutral state; no live payment provider activation in this phase

Exit gate:

- usage totals reconcile from source events
- plan enforcement fails closed on exceeded limits
- billing metadata is workspace-scoped
- no external billing charge/write is performed

### Phase 16D — Agency, white-label and custom domains

Deliver:

- explicit agency parent/client workspace mapping
- parent administration authorization contract separate from ordinary workspace membership
- white-label configuration per workspace
- custom-domain ownership verification state
- isolation tests proving branding/domain settings cannot bleed between workspaces

Exit gate:

- tenant penetration/isolation tests pass
- parent/child relationship alone does not grant data access
- hostname uniqueness and verification states enforced
- white-label configuration stays isolated by workspace

### Phase 16E — Enterprise webhooks and developer controls

Deliver:

- persisted outbound webhook endpoint metadata
- encrypted/signing-secret storage contract; never plaintext at rest
- HMAC-SHA256 signing via existing signed-webhook foundation
- replay-window verification contract
- developer request logs
- rate-limit visibility and auditability
- endpoint pause/revoke state

Exit gate:

- signatures verify with timing-safe comparison
- old/replayed timestamps are rejected
- revoked/paused endpoints do not emit
- logs remain workspace-scoped and do not expose secrets

### Phase 16F — Governance, CI and completion evidence

Deliver:

- Phase 16-specific exit-gate tests
- Prisma migration regression
- strict TypeScript
- production build
- browser tests only where UI/user behavior changes
- tenant-isolation/security review
- rollback documentation
- draft PR against current release branch

Completion vocabulary:

`repository implemented` != `production evidence approved` != `live`.

Phase 16 repository completion does not authorize production migration, commercial billing activation, custom-domain DNS changes, public API exposure, provider writes, or rollout.

## Production boundary

Phase 16 production work must remain a separate controlled operation after repository CI and review. It requires a fresh production baseline audit, verified database backup, additive migration dry-run/regression evidence, explicit approval, controlled migration, build/deploy, smoke tests, rollback evidence, and post-deploy tenant-isolation checks.

Until that separate production gate is approved:

- `ENGAGEOS_PHASE16_PRODUCTION_EVIDENCE` remains absent/false
- `ENGAGEOS_PHASE16_LIVE` remains absent/false
- no billing provider writes
- no public API activation
- no custom-domain cutover
- no outbound enterprise webhook activation
