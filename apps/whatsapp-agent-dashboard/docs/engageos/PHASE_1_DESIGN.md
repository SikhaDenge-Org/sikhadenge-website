# Phase 1 Design — Omnichannel Domain Foundation

## Status

Implementation branch: `agent/phase-1-omnichannel-domain`

Base: EngageOS release containing Phase 0 stabilization and architecture baseline.

Phase 1 introduces compile-time contracts only. It does not switch existing runtime reads or writes, alter current webhook routes, change outbound behavior, or mutate the production database.

## Objective

Create the channel-neutral domain vocabulary required by future Inbox, CRM, event processing, automation, AI, analytics, and channel adapters while preserving current WhatsApp behavior.

## Implemented boundaries

```text
shared/types/brand.ts
modules/workspaces/domain/workspace.ts
modules/channels/core/contracts/channel.ts
modules/customers/domain/customer.ts
modules/inbox/domain/conversation.ts
modules/inbox/application/repositories.ts
modules/events/domain/channel-event.ts
modules/channels/whatsapp/mapping/legacy-whatsapp-contracts.ts
modules/index.ts
```

## Contract decisions

### Branded identifiers

Workspace, connection, customer, identity, conversation, message, interaction, raw-event, and normalized-event IDs use branded strings.

Benefits:

- prevents accidental interchange of unrelated IDs at compile time
- rejects blank identifiers at runtime boundaries
- avoids coupling domain contracts to Prisma-generated types

### Workspace context

Repository ports receive `WorkspaceContext` explicitly. Domain entities carry `workspaceId`.

`assertWorkspaceAccess` fails closed with `WorkspaceScopeError` when an entity does not belong to the active workspace.

No repository API introduced in Phase 1 accepts only a record ID without workspace context.

### Channel capabilities

Generic code does not infer support from channel names. A `ChannelConnection` carries an explicit capability registry.

Initial capabilities include:

- webhook verification
- inbound messages
- outbound text/media
- delivery/read state
- comment events and replies
- private comment replies
- story replies
- mention events

Unsupported capabilities remain false and must stay disabled in UI/application behavior.

### Customer identities

A customer is separate from a platform identity.

External identity uniqueness is bounded by:

```text
workspaceId + connectionId + channel + externalUserId
```

Phase 1 does not permit automatic identity merging based only on names, phone formatting, usernames, or profile labels.

### Conversation, message, and interaction contracts

The Inbox domain now has channel-neutral contracts for:

- conversation status and AI/human/pause mode
- inbound/outbound message direction
- customer/AI/human/system actors
- text and media message kinds
- local delivery states
- generic timeline interactions such as comments, mentions, reviews, notes, assignments, and automation events

Message invariants reject empty text messages and media messages without a provider or URL reference.

### Normalized event envelope

Every normalized event requires:

- workspace and connection scope
- channel and typed event name
- external event ID
- occurred and received timestamps
- raw-event reference
- schema version
- optional actor, conversation, and interaction references
- typed payload

The deterministic event key is:

```text
workspaceId + connectionId + eventType + externalEventId
```

This key is a contract for future unique constraints and idempotent processing; Phase 1 does not yet persist or enqueue events.

### Repository ports

Conversation and message repositories are interfaces owned by the Inbox application layer.

Every method requires `WorkspaceContext`. Pagination limits are validated between 1 and 200.

No Prisma repository implementation is introduced in this phase, so existing production reads and writes remain unchanged.

### WhatsApp compatibility mapping

Pure compatibility functions translate legacy WhatsApp conversation/message records into the new domain contracts.

The mapper:

- imports no Prisma Client
- performs no database query
- sends no message
- mutates no legacy record
- preserves legacy IDs as bounded compatibility references
- rejects unsupported status, actor, direction, and agent-mode values

This provides a testable seam for future read parity and backfill work.

## Additive Prisma design

No Prisma schema change is included in Phase 1. The following design is proposed for a later isolated migration PR after architecture review.

### Initial additive models

```text
Workspace
WorkspaceMembership
ChannelConnection
Customer
CustomerIdentity
Conversation
Message
Interaction
RawChannelEvent
ChannelEvent
```

### Required fields

All new operational models must carry `workspaceId` directly or through an enforced parent relation.

External IDs require connection-bounded composite uniqueness. Candidate constraints:

```text
CustomerIdentity: unique(workspaceId, connectionId, channel, externalUserId)
Conversation: unique(workspaceId, connectionId, externalConversationId)
Message: unique(workspaceId, connectionId, externalMessageId)
RawChannelEvent: unique(workspaceId, connectionId, externalEventId)
ChannelEvent: unique(workspaceId, connectionId, type, externalEventId)
```

Nullable external IDs must be handled carefully because PostgreSQL permits multiple null values in unique constraints.

### Legacy mapping

Initial target rows may carry temporary migration metadata:

```text
legacySource
legacyRecordId
migrationBatchId
migratedAt
```

Existing `WhatsAppContact`, `WhatsAppConversation`, `WhatsAppMessage`, status-event, lead, tag, template, webhook-event, knowledge, learning, and audit models remain intact during additive introduction.

## Migration sequence

1. Review this contract PR.
2. Produce exact Prisma schema diff and SQL migration in a separate branch.
3. Create a production database backup identifier.
4. Test migration on a database copy.
5. Measure lock/index impact.
6. Deploy additive tables with all new paths disabled.
7. Backfill one model at a time using restartable, idempotent scripts.
8. Generate count and parity reports.
9. Enable shadow reads only.
10. Cut over individual read surfaces behind flags.
11. Introduce generic writes only after transaction/outbox design is approved.
12. Retain legacy tables until parity and rollback windows close.

## Rollback design

For additive schema deployment, application rollback should normally leave unused additive tables in place and disable feature flags/read paths.

A destructive database rollback is prohibited when it would discard valid data written after activation.

Every future migration PR must record:

- pre-change SHA
- migration name and SQL
- database backup identifier
- expected row/index changes
- feature flag defaults
- rollback decision
- smoke checks

## Test evidence required

Phase 1 automated coverage verifies:

- blank IDs are rejected
- channel capabilities fail closed
- external identity keys are deterministic and connection-scoped
- legacy WhatsApp records map without Prisma/runtime coupling
- text/media message invariants
- normalized event keys and timestamp/schema validation
- repository pagination bounds
- same-workspace access succeeds
- cross-workspace read/write attempts throw `WorkspaceScopeError`

## Out of scope

- Prisma schema or migration files
- database backfill
- runtime repository implementation
- webhook route refactor
- queue or worker introduction
- UI changes
- feature activation
- production deployment
- comment automation
- unrestricted AI auto-send

## Exit gate

Phase 1 is complete when:

- contracts compile under strict TypeScript
- unit/tenant-isolation tests pass
- existing agent tests and production build remain green
- PR review confirms module boundaries and additive migration design
- no production runtime or database behavior changes
