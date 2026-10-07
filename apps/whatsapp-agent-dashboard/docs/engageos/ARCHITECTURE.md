# EngageOS Architecture

## 1. Architecture goal

EngageOS must support multiple messaging and engagement platforms without duplicating business logic for every channel. The architecture therefore separates:

1. platform transport
2. normalized events
3. customer and conversation domains
4. automation execution
5. AI decisioning
6. policy enforcement
7. human operations
8. analytics and audit

The first implementation remains one deployable Next.js application with background workers. Internal boundaries must be strong enough to extract workers or high-volume adapters later.

## 2. Runtime overview

```text
External platform
  -> webhook/polling adapter
  -> signature and schema validation
  -> raw event persistence
  -> idempotency check
  -> channel-neutral event normalization
  -> durable queue
  -> event processor
  -> policy evaluation
  -> automation trigger evaluation
  -> AI or deterministic action planning
  -> approval/handoff decision
  -> outbound queue
  -> channel adapter
  -> external platform
  -> delivery/status event
  -> Inbox, CRM, analytics, and audit updates
```

Long-running work must not execute inside the webhook request lifecycle. A webhook route validates, persists, enqueues, and acknowledges.

## 3. Core bounded modules

### Workspaces

Owns tenant identity, settings, timezone, branding, retention, and feature availability.

### Auth and permissions

Owns users, sessions, roles, granular permissions, authentication policy, and access checks.

### Channels

Owns channel connections, encrypted credentials, capabilities, webhook subscriptions, account health, rate-limit state, and transport adapters.

### Events

Owns raw inbound events, normalized event contracts, idempotency, processing attempts, retries, dead-letter records, and replay.

### Customers

Owns the universal customer record, identities, merge evidence, consent, communication preferences, and suppression.

### Inbox

Owns conversations, messages, interactions, assignments, unread state, agent mode, service windows, and the unified timeline.

### CRM

Owns leads, stages, scoring, notes, tasks, follow-ups, ownership, and conversion state.

### Automations

Owns triggers, conditions, actions, flow versions, validation, simulation, execution state, goals, delays, and error paths.

### AI

Owns intent classification, retrieval, memory, response planning, generation, evaluation, safety, provider routing, and handoff recommendations.

### Knowledge

Owns approved knowledge documents, versions, chunks, effective dates, review status, and retrieval contracts.

### Learning

Owns counselor corrections, proposed knowledge updates, approval, conflict checks, and activation evidence.

### Campaigns

Owns audiences, schedules, message plans, approvals, frequency controls, suppression, execution, and attribution.

### Policy

Owns channel windows, consent rules, quiet hours, rate limits, content restrictions, approval requirements, and outbound eligibility.

### Analytics

Owns derived metrics, funnels, aggregates, attribution, operational telemetry, and report query models.

### Audit

Owns immutable records of actor, action, entity, before/after state, request context, and system decisions.

## 4. Channel-neutral contracts

### Normalized event envelope

```ts
export interface ChannelEvent<TPayload = unknown> {
  id: string;
  workspaceId: string;
  connectionId: string;
  channel: ChannelType;
  type: ChannelEventType;
  externalEventId: string;
  occurredAt: Date;
  receivedAt: Date;
  actorIdentity?: ExternalIdentityReference;
  conversationReference?: ExternalConversationReference;
  interactionReference?: ExternalInteractionReference;
  payload: TPayload;
  rawEventId: string;
  schemaVersion: number;
}
```

### Required initial event types

```text
MESSAGE_RECEIVED
MESSAGE_SENT
MESSAGE_DELIVERED
MESSAGE_READ
MESSAGE_FAILED
COMMENT_CREATED
COMMENT_REPLIED
PRIVATE_REPLY_SENT
STORY_REPLY_RECEIVED
MENTION_CREATED
REVIEW_CREATED
REVIEW_UPDATED
CONTACT_UPDATED
CHANNEL_CONNECTED
CHANNEL_DISCONNECTED
TOKEN_EXPIRING
TOKEN_REVOKED
```

### Channel adapter contract

```ts
export interface ChannelAdapter {
  readonly channel: ChannelType;
  getCapabilities(): ChannelCapabilities;
  verifyWebhook(input: WebhookVerificationInput): Promise<WebhookVerificationResult>;
  parseWebhook(input: RawWebhookInput): Promise<ParsedChannelEvent[]>;
  sendText(input: SendTextInput): Promise<OutboundResult>;
  sendMedia?(input: SendMediaInput): Promise<OutboundResult>;
  replyToComment?(input: ReplyToCommentInput): Promise<OutboundResult>;
  sendPrivateReply?(input: SendPrivateReplyInput): Promise<OutboundResult>;
  refreshConnection?(input: RefreshConnectionInput): Promise<ConnectionHealth>;
}
```

Unsupported methods are represented through capabilities and never assumed by generic modules.

## 5. Data architecture principles

### Workspace isolation

All business records introduced for EngageOS must be scoped by `workspaceId`, directly or through a guaranteed parent relation. Every repository query must receive workspace context.

### Additive migration

Initial omnichannel migrations add new tables and mapping fields. Existing WhatsApp tables remain readable until parity, backfill, dual-read, cutover, and rollback validation are complete.

### External identifiers

External IDs are unique only within the correct platform and connected account boundary. Composite uniqueness must include the channel connection where required.

### Immutable raw evidence

Raw webhook events and material outbound responses must be retained with redaction controls so processing can be audited and replayed.

### Derived read models

Inbox lists, dashboards, and analytics may use dedicated projections or aggregate tables. They must be reproducible from authoritative operational events.

## 6. Event processing guarantees

The target is effectively-once business behavior over at-least-once delivery.

Required controls:

- deterministic event key
- unique idempotency constraint
- processing lease/lock
- attempt counter
- exponential backoff
- permanent/transient error classification
- dead-letter queue
- replay token
- outbound idempotency key
- transaction or outbox pattern for state plus queued action

An event replay must never silently create a duplicate public reply, private reply, message, lead, or payment action.

## 7. Automation architecture

### Flow lifecycle

```text
DRAFT -> VALIDATING -> READY -> PUBLISHED -> PAUSED -> ARCHIVED
```

Published versions are immutable. Editing a published flow creates a new draft version.

### Runtime pipeline

```text
Normalized event
  -> candidate trigger lookup
  -> flow/version eligibility
  -> customer frequency and suppression check
  -> condition evaluation
  -> execution instance creation
  -> node execution
  -> wait/approval/handoff/complete/fail
  -> audit and analytics events
```

### Safety controls

- maximum node count
- maximum execution duration
- loop detection
- recursion limit
- per-customer frequency cap
- per-flow concurrency limit
- platform policy check before every outbound action
- approval gate for sensitive actions
- deterministic retry semantics

## 8. AI architecture

AI does not directly own outbound transport. It proposes structured actions.

```text
Customer input
  -> safety and language detection
  -> intent classification
  -> customer/conversation context
  -> approved knowledge retrieval
  -> response plan
  -> response generation
  -> factual and policy evaluation
  -> confidence policy
  -> send, approval, or human handoff
```

A generated response carries:

- model/provider
- prompt policy version
- retrieved knowledge references
- confidence
- evaluator result
- risk classification
- decision reason

Business-critical facts such as fees, dates, links, policies, refunds, and promises must come from approved structured knowledge or require human review.

## 9. Inbox architecture

The Inbox reads a channel-neutral conversation model. Channel-specific details appear through capabilities and interaction metadata.

The UI must not call Meta, Google, or other platform APIs directly. It calls EngageOS application APIs, which authorize the user, enforce workspace scope, validate policy, enqueue outbound work, and return a tracked local message state.

Realtime updates may use SSE first. WebSocket adoption requires a demonstrated bidirectional realtime need.

## 10. Security architecture

Required baseline:

- encrypted channel credentials
- key versioning and rotation
- role and permission checks
- tenant-scoped repositories
- webhook signature verification
- replay protection
- request validation
- rate limiting
- audit logs
- secret redaction
- customer suppression
- outbound kill switches
- AI kill switch
- feature flags
- environment validation

No secret, token, system prompt, raw credential, or private platform payload may be sent to the browser unless explicitly required and redacted.

## 11. Observability

Every request, event, execution, and outbound attempt should carry correlation identifiers:

```text
requestId
rawEventId
channelEventId
automationExecutionId
conversationId
messageId
outboundAttemptId
workspaceId
```

Logs must be structured and redact message content or personal data according to environment and retention policy.

Operational dashboards must expose:

- webhook success and latency
- queue depth and age
- event processing failures
- dead-letter count
- platform error rates
- token expiry
- rate-limit pressure
- AI latency and failures
- outbound success
- duplicate prevention events

## 12. Deployment architecture

Initial deployment may continue as one Next.js application plus separate worker processes under PM2. Process responsibilities should be explicit:

```text
web        -> dashboard, APIs, webhook acknowledgements
worker     -> event and automation processing
scheduler  -> delays, follow-ups, campaign schedules
```

A future service extraction is justified only by measured requirements such as independent scaling, isolation, failure containment, or deployment cadence.

## 13. Dependency rules

- Generic modules may depend on channel contracts, not concrete channel implementations.
- Channel modules may publish normalized events, not mutate CRM or lead state directly.
- AI may call knowledge and customer-context interfaces, not direct Prisma queries across modules.
- Analytics consumes events/read models and must not become the source of operational truth.
- UI components must not contain transport credentials or platform policy logic.
- Shared code is limited to genuinely cross-domain infrastructure; business logic belongs to a named module.

## 14. Architecture review triggers

An architecture decision record is required before:

- introducing a new persistent service
- adding a new queue technology
- changing tenant isolation strategy
- replacing the primary database
- exposing a public API
- permitting automatic identity merge
- enabling unrestricted AI auto-send
- moving a module into a separate deployable service
