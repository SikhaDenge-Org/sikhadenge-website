# Phase 2 Security, Permissions, Consent, and Kill Switches

## Status

This document defines the Phase 2 application-security foundation for EngageOS.

The implementation in this phase is additive and side-effect free. It introduces enforceable domain/application contracts and tests without changing the current production Prisma schema, legacy WhatsApp routes, live credentials, webhook callbacks, or outbound transport behavior.

## Objectives

1. Fail closed when workspace membership or permission is missing.
2. Prevent usable channel credentials from reaching browser-safe DTOs.
3. Verify webhook signatures in constant time and reject replay-window violations.
4. Require affirmative marketing consent.
5. Apply customer, channel, connection, and purpose suppressions.
6. Stop new and already queued work through scoped kill switches.
7. Produce immutable security audit events without secret-bearing metadata.
8. Establish one mandatory outbound safety pipeline for future generic workers and APIs.

## Role and permission matrix

The initial workspace roles remain compatible with the existing dashboard role enum:

- `ADMIN`
- `MANAGER`
- `COUNSELOR`
- `ANALYST`
- `VIEWER`

Granular permissions cover:

- workspace and member administration
- channel read/manage
- Inbox read/reply/assignment
- customer read/manage
- automation read/manage/publish
- campaign read/manage/launch
- AI use/manage
- analytics read
- audit read
- security management

Rules:

- `ADMIN` has all permissions.
- `MANAGER` can run operational workflows but cannot manage workspace security or credentials.
- `COUNSELOR` can read and reply in Inbox and manage customer context, but cannot launch campaigns or publish automations.
- `ANALYST` is read-oriented and cannot send outbound messages.
- `VIEWER` is read-only.
- inactive membership always fails closed.
- actor and membership IDs must match.
- membership workspace must match the request workspace.

## Workspace membership model

The application contract is:

```ts
interface WorkspaceMembership {
  workspaceId: WorkspaceId;
  userId: WorkspaceActorId;
  role: WorkspaceRole;
  isActive: boolean;
}
```

Future persistence is additive:

```text
WorkspaceMembership
Role
Permission
RolePermission
```

The current `DashboardUser.role` remains authoritative until an additive migration, backfill, parity report, and feature-flagged cutover are reviewed.

## Authorization enforcement

Every new API/use case must call `assertPermission` before reading or mutating protected business state.

Required order:

```text
authenticated actor
  -> active workspace membership
  -> workspace scope match
  -> actor membership match
  -> granular permission
  -> application use case
```

UI permission snapshots must be derived server-side from the same role matrix. Hiding a button is not authorization; the API/application check remains mandatory.

## Credential storage boundary

Channel credentials use an encrypted envelope design:

```text
algorithm: AES_256_GCM
keyVersion
initializationVector
authenticationTag
ciphertext
```

The browser-safe view exposes only:

- credential record ID
- connection ID
- channel
- credential kind
- key version
- expiry timestamp
- configured status
- created/updated timestamps

It never exposes ciphertext, IV, authentication tag, plaintext tokens, app secrets, webhook secrets, refresh tokens, or API keys.

A future infrastructure adapter must use a managed or environment-backed key encryption strategy with key versioning and rotation. Secret decryption remains server-only and must produce a security audit event.

## Webhook security

The core webhook contract provides:

- HMAC SHA-256 verification
- constant-time signature comparison
- configurable signature prefix
- strict hexadecimal signature parsing
- maximum webhook age
- maximum future clock skew
- deterministic replay key from connection and external event ID

A platform adapter is responsible for selecting the official provider header and canonical signed payload. The generic security contract never silently accepts malformed signatures.

Future webhook persistence must apply a unique replay/idempotency constraint before business processing.

## Consent model

Consent is scoped by:

- workspace
- customer
- channel
- purpose

Initial purposes:

- `SERVICE`
- `TRANSACTIONAL`
- `MARKETING`

Rules:

- marketing requires latest matching consent state `GRANTED`
- latest `REVOKED` blocks the matching purpose
- service and transactional messages are permitted without affirmative marketing consent unless explicitly revoked or suppressed
- consent history is append-oriented; policy evaluates the latest matching event

## Suppression model

A suppression can target:

- customer
- channel connection
- channel
- one purpose or all purposes
- bounded or indefinite time window

Reasons include opt-out, complaint, legal restriction, bounce, abuse, admin action, and other documented causes.

An active matching suppression blocks the outbound action before queueing or sending, regardless of consent state.

## Kill switch model

Scopes:

- workspace
- channel
- connection
- automation
- AI
- campaign

Actions:

- `OUTBOUND_NEW`
- `OUTBOUND_QUEUED`
- `AUTOMATION_EXECUTION`
- `AI_GENERATION`
- `CAMPAIGN_EXECUTION`

Semantics:

- blocking `OUTBOUND_NEW` prevents new queue entries
- blocking `OUTBOUND_QUEUED` prevents already queued work from being sent
- automation, AI, and campaign switches are evaluated in addition to outbound switches
- a workspace switch is the emergency global stop
- deactivation is explicit and auditable

Future workers must re-evaluate switches immediately before each external send so a queued job cannot bypass a newly activated stop.

## Outbound safety pipeline

All future generic outbound paths must call one application gate:

```text
workspace scope
  -> source-specific permission
  -> channel capability
  -> consent and suppression
  -> new/queued kill switch
  -> automation/AI/campaign kill switch
  -> enqueue or send
```

Source permissions:

- manual reply -> `inbox.reply`
- automation -> `automations.publish`
- AI -> `ai.use`
- campaign -> `campaigns.launch`

No generic outbound adapter may be called before this gate succeeds.

## Security audit events

Initial actions:

- authorization denied
- outbound blocked
- credential viewed
- kill switch activated/deactivated
- consent changed
- suppression changed
- webhook rejected

Audit metadata rejects secret-bearing keys such as token, secret, password, authorization, ciphertext, and raw payload.

Future persistence should add workspace, request, correlation, actor, entity, reason, outcome, and retention classification.

## Tests

The Phase 2 test suite covers:

- allowed and denied role permissions
- inactive membership
- cross-workspace denial
- credential public-view redaction
- valid and invalid HMAC signatures
- stale webhook rejection
- deterministic replay key
- marketing consent requirement
- revoked consent
- all-purpose suppression
- new and queued kill-switch blocking
- workspace kill-switch isolation
- outbound permission and capability checks
- outbound consent and queued-work checks
- immutable audit events
- forbidden audit metadata

## Persistence plan

No Prisma mutation is included in this change.

A later additive migration PR may introduce:

```text
WorkspaceMembership
Role
Permission
RolePermission
ChannelCredential
CustomerConsentEvent
CustomerSuppression
KillSwitch
SecurityAuditEvent
WebhookReplayRecord
```

That PR requires:

- production backup identifier
- migration SQL review
- database-copy execution
- lock/index assessment
- legacy role mapping
- backfill counts
- rollback decision
- feature flags
- tenant-isolation integration tests

## Current limitations

- existing legacy routes are not redirected to the new gate in this contract-only change
- current credentials are not migrated or re-encrypted
- no production kill-switch records are created
- no consent or suppression backfill is executed
- no UI permission snapshot endpoint is activated

These integrations must be performed incrementally so existing WhatsApp behavior remains stable.

## Exit evidence for this foundation PR

- strict TypeScript
- existing agent tests
- Phase 1 domain tests
- Phase 2 security tests
- Prisma validation/generation
- production build
- authenticated Inbox browser regression
- no schema, route, transport, or production side effects
