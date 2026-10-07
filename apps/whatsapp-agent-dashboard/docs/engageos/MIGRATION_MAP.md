# EngageOS Migration Map

## Purpose

The current application is WhatsApp-centric. Its Prisma schema contains working operational models such as `WhatsAppContact`, `WhatsAppConversation`, `WhatsAppMessage`, `WhatsAppMessageStatusEvent`, `WhatsAppTemplate`, `Lead`, `WebhookEvent`, `KnowledgeDocument`, `LearningSuggestion`, and `AuditLog`.

The migration must preserve current production behavior while introducing channel-neutral models. Existing tables must not be renamed or dropped in the first migration.

## Migration principles

1. Add before replacing.
2. Backfill before switching reads.
3. Verify parity before switching writes.
4. Dual-read only for a bounded transition period.
5. Avoid uncontrolled dual-write; use one authoritative transaction/outbox path.
6. Keep rollback possible until the legacy path is formally retired.
7. Every backfill is idempotent and restartable.
8. Every data transformation records counts, failures, and checkpoints.

## Current-to-target model map

| Current model | Target direction | Initial treatment |
|---|---|---|
| `DashboardUser` | `User` plus `WorkspaceMembership` | Keep existing user table; add workspace membership and permission relations. |
| `DashboardSession` | Auth session | Keep and add workspace-aware authorization checks. |
| `WhatsAppContact` | `Customer` plus `CustomerIdentity` | Add target records and map each `waId` identity; retain existing row during transition. |
| `WhatsAppConversation` | `Conversation` | Add generic conversation linked to WhatsApp channel connection and mapped legacy ID. |
| `WhatsAppMessage` | `Message` | Add generic message with external ID, direction, actor, type, status, and channel metadata. |
| `WhatsAppMessageStatusEvent` | `MessageStatusEvent` | Add generic status history and backfill from existing records. |
| `WhatsAppTemplate` | `ChannelTemplate` | Add workspace, connection, channel, external template ID, and capability metadata. |
| `Lead` | CRM `Lead` | Evolve carefully; remove hard dependency on WhatsApp contact/conversation only after generic links exist. |
| `LeadNote` | CRM note/activity | Add workspace and generic lead ownership path. |
| `ConversationTag` | Workspace tag | Add workspace scope before multi-tenant use. |
| `ConversationTagLink` | Generic conversation tag link | Add generic conversation mapping. |
| `WebhookEvent` | `RawChannelEvent` plus `ChannelEvent` and processing attempts | Preserve current events; add immutable raw record and normalized processing state. |
| `KnowledgeDocument`/`KnowledgeChunk` | Versioned knowledge module | Add workspace, approval actor, policy version, and structured fact support. |
| `LearningSuggestion` | Learning review candidate | Add workspace, source channel/conversation, conflict check, and activated knowledge version. |
| `AuditLog` | Workspace audit event | Add workspace, request/correlation IDs, decision metadata, and retention classification. |

## Proposed additive target models

Names are design-level until Phase 1 data design is reviewed.

```text
Workspace
WorkspaceMembership
Role
Permission
RolePermission
ChannelConnection
ChannelCredential
ChannelCapabilitySnapshot
Customer
CustomerIdentity
CustomerMergeEvidence
CustomerConsentEvent
CustomerSuppression
Conversation
ConversationParticipant
Message
MessageStatusEvent
Interaction
MediaAsset
RawChannelEvent
ChannelEvent
EventProcessingAttempt
DeadLetterEvent
OutboundAttempt
Automation
AutomationVersion
AutomationExecution
AutomationNodeExecution
Campaign
CampaignAudienceSnapshot
CampaignExecution
TrackedLink
ConversionEvent
FeatureFlag
KillSwitch
```

## Required compatibility identifiers

Target records should include bounded migration metadata where useful:

```text
legacySource
legacyRecordId
migrationBatchId
migratedAt
```

These fields are transitional and must not become permanent business identifiers.

## Phase A — Schema preparation

Add without changing existing runtime behavior:

- default internal workspace
- membership for current dashboard users
- WhatsApp channel connection representing the current business account
- generic customer identity tables
- generic conversation/message tables
- legacy mapping fields or mapping table
- event processing tables
- workspace scoping for new models

Required checks:

- Prisma validation
- migration SQL review
- migration on database copy
- lock-duration assessment
- index creation strategy
- rollback SQL/runbook

## Phase B — Backfill

### Contacts

For every `WhatsAppContact`:

1. create or find `Customer`
2. create `CustomerIdentity` with channel `WHATSAPP`
3. preserve phone, WA ID, display/profile names, language, city, consent, and metadata
4. record legacy mapping

### Conversations

For every `WhatsAppConversation`:

1. resolve mapped customer and WhatsApp identity
2. create generic `Conversation`
3. preserve status, agent mode, source, campaign, intent, language, confidence, summary, unread count, service window, handoff data, assignee, and timestamps
4. record legacy mapping

### Messages

For every `WhatsAppMessage`:

1. resolve generic conversation
2. create generic `Message`
3. preserve external message ID, direction, actor, type, status, text, media, reply reference, AI metadata, failures, timestamps, and redacted raw payload reference
4. backfill status events
5. record legacy mapping

### Leads and tags

- connect current lead to generic customer and conversation
- copy tag links to generic conversation links
- preserve assignments, notes, stage, score, temperature, and follow-up dates

## Backfill safety requirements

- checkpoint by primary key or timestamp
- deterministic upsert key
- dry-run mode
- batch-size configuration
- per-model counts
- failure file/table
- resume support
- no external sends
- no trigger of AI or automations

## Phase C — Read parity

For a controlled test set, compare legacy and generic read models:

- conversation count
- message count
- latest message
- unread count
- status and agent mode
- assigned counselor
- customer fields
- lead fields
- tags
- delivery states

A parity report is required before any UI read cutover.

## Phase D — New-write path

New inbound WhatsApp events should write through the channel-neutral application path. During transition:

- generic models are authoritative for new omnichannel behavior
- compatibility updates keep legacy UI operational only where required
- an outbox/transaction strategy prevents partial generic/legacy state
- duplicate external message IDs remain uniquely constrained

## Phase E — Read cutover

Cut over one query surface at a time:

1. internal diagnostics
2. conversation details
3. conversation list
4. customer panel
5. lead panel
6. analytics projections

Each cutover is feature-flagged and reversible.

## Phase F — Legacy retirement

Legacy WhatsApp tables may be retired only when:

- all reads use generic models
- all writes use generic models
- backfill and parity reports are archived
- rollback window is closed explicitly
- no active code imports legacy repositories
- production backup is verified
- destructive migration receives separate approval

Retirement should first make tables read-only/unused. Physical drop is a later isolated migration.

## Current code migration direction

| Current area | Target module |
|---|---|
| `lib/agent/*` | `modules/ai/*`, `modules/knowledge/*`, and `modules/learning/*` by responsibility |
| WhatsApp webhook route | thin route plus `modules/channels/whatsapp/webhook/*` |
| Instagram webhook route | thin route plus `modules/channels/instagram/webhook/*` |
| Messenger webhook route | thin route plus `modules/channels/messenger/webhook/*` |
| outbound API clients | corresponding channel `outbound/*` module |
| mixed social agent bridge | channel-neutral event/application service plus per-channel adapter |
| `InboxDashboardV2.tsx` | Inbox container, hooks, timeline, composer, customer panel, and modal components |
| direct Prisma access in routes | module repository/application use case |
| string-based capability checks | typed capability registry |

## Inbox decomposition plan

Do not rewrite the Inbox in one PR. Extract in this order:

1. channel/capability view model
2. typed API client
3. conversation list state hook
4. selected conversation state hook
5. composer state and send command
6. timeline component
7. customer intelligence panel
8. templates/media modals
9. responsive layout styles
10. legacy container removal

Every extraction requires unchanged behavior tests.

## Rollback strategy

Before each migration step record:

- source branch and commit
- migration name
- database backup identifier
- feature-flag state
- backfill batch/checkpoint
- rollback commands
- affected API/UI surfaces

Rollback must not delete valid inbound events received after cutover. If database schema rollback would lose data, application rollback must retain the additive schema and switch feature flags/read paths instead.
