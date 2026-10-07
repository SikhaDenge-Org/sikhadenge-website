# EngageOS Engineering Standards

## 1. Repository scope

All EngageOS implementation work is limited to:

```text
apps/whatsapp-agent-dashboard
```

Shared root-level changes require a documented reason and impact review because the repository contains unrelated applications.

## 2. Branch strategy

### Protected long-lived branches

- `deploy/whatsapp-live-combined-20260727`: current production-target branch until a later canonical branch is explicitly approved.
- release branches: integration/testing only; not automatically production.

### Working branches

Use one branch per bounded change:

```text
agent/phase-0-stabilization
agent/phase-1-omnichannel-domain
agent/instagram-comment-events
agent/inbox-composer-decomposition
agent/automation-runtime
```

Rules:

- never develop directly on the production-target branch
- never combine unrelated phases in one branch
- rebase/merge baseline deliberately and document conflicts
- do not force-update a shared branch without explicit approval

## 3. Pull request standard

Every PR must include:

- problem and objective
- exact scope
- out-of-scope items
- architecture/module impact
- database impact
- API impact
- UI impact
- security and privacy impact
- platform-policy impact
- feature flags
- tests run
- screenshots for UI changes
- migration/rollback plan
- production activation plan

Default state is draft until checks and review are complete.

## 4. Commit standard

Commits should be small, intentional, and describe one logical change.

Preferred examples:

```text
Add normalized channel event contract
Extract Inbox composer state
Verify Instagram webhook signatures
Add automation graph validation
Backfill WhatsApp customer identities
```

Avoid vague messages such as `update`, `fix`, `changes`, or `final`.

## 5. TypeScript standard

- strict mode remains enabled
- no new `any` without documented boundary justification
- parse external payloads as `unknown`
- validate external input before narrowing
- use discriminated unions for channel events and automation nodes
- prefer explicit result types for operations that can fail
- avoid unchecked type assertions
- public module contracts require exported types

## 6. API standard

### Versioning

New business APIs should use:

```text
/api/v1/...
```

Webhook URLs remain platform-specific under `/api/webhooks/...`.

### Route responsibilities

A route may:

- authenticate or verify signature
- validate input
- call an application use case
- translate result/error to HTTP

A route must not:

- contain long business workflows
- perform direct multi-module Prisma mutations
- execute AI generation synchronously for webhook acknowledgement
- contain platform policy scattered as inline conditionals

### Response format

Use a consistent envelope for new APIs:

```ts
interface ApiSuccess<T> {
  ok: true;
  data: T;
  requestId: string;
}

interface ApiFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId: string;
}
```

Do not expose stack traces, secrets, raw provider errors, or private payloads to clients.

## 7. Validation standard

Validate every external boundary:

- HTTP body/query/path
- webhook payload
- environment variables
- queue jobs
- provider API responses when material
- automation graph definitions
- imported CSV/data

Validation schemas should live near the owning module and be reusable by route, worker, and tests.

## 8. Database standard

### Migrations

- all production schema changes use committed Prisma migrations
- no `db push` for production evolution
- migration SQL must be reviewed
- destructive operations require separate approval
- large backfills run through restartable scripts/jobs, not a blocking schema migration
- indexes and constraints require lock/performance assessment

### Workspace isolation

New operational records require workspace scope. Repository methods must receive workspace context and tests must prove that IDs from another workspace cannot be read or mutated.

### Transactions

Use transactions for state changes that must remain consistent. Use outbox/event patterns when a database change must cause asynchronous work.

## 9. Webhook standard

Every webhook implementation requires:

- challenge/verification handling where applicable
- signature verification
- timestamp/replay protection where supported
- payload size limits
- schema parsing
- raw event persistence with redaction policy
- deterministic idempotency key
- fast acknowledgement
- durable queue handoff
- retry/dead-letter behavior
- fixture-based tests

## 10. Outbound messaging standard

Before enqueueing or sending, evaluate:

- workspace/account kill switches
- connection health
- permission/capability
- customer consent/suppression
- platform messaging window
- quiet hours
- frequency limits
- flow version status
- approval requirement
- idempotency key

Every outbound attempt records local message/action ID, external ID when available, attempt number, result, normalized error, timestamps, and correlation IDs.

## 11. AI standard

AI output is untrusted until evaluated.

Required controls:

- approved knowledge retrieval
- provider/model abstraction
- prompt policy version
- source references
- confidence score or decision signal
- factual/business-rule evaluation
- safety evaluation
- platform-policy evaluation
- approval/handoff route
- structured audit metadata

AI must not invent fees, dates, links, policies, refunds, guarantees, placement outcomes, or contractual promises.

## 12. Feature flags

All risky or user-visible migrations require a flag with:

- clear name
- owner
- default value
- workspace/account scope where needed
- activation instructions
- rollback behavior
- retirement condition

Flags must not become permanent undocumented branches in business logic.

## 13. Error handling

Use normalized application errors:

```text
VALIDATION_ERROR
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
CONFLICT
RATE_LIMITED
CHANNEL_UNAVAILABLE
POLICY_BLOCKED
APPROVAL_REQUIRED
TRANSIENT_PROVIDER_ERROR
PERMANENT_PROVIDER_ERROR
INTERNAL_ERROR
```

Provider-specific errors are mapped inside the owning channel adapter.

## 14. Logging and privacy

Structured logs should include identifiers, not unrestricted content.

Safe fields include:

- request/correlation IDs
- workspace and connection IDs
- event/message/execution IDs
- operation
- duration
- normalized status/error code

Sensitive message content, tokens, phone numbers, emails, raw payloads, and retrieved knowledge require redaction or controlled storage.

## 15. Test pyramid

### Unit tests

Required for domain policies, mapping, validation, automation nodes, AI decision rules, and error classification.

### Integration tests

Required for Prisma repositories, transactions, queue/outbox behavior, idempotency, workspace isolation, and backfills.

### Contract tests

Required for every channel adapter using sanitized webhook/API fixtures.

### Browser tests

Required for login, Inbox, composer, modals, assignment, AI/human controls, automation builder, and responsive behavior.

### Production smoke tests

Read-only or controlled test-identity checks only. Smoke tests must never message real customers without explicit scope.

## 16. Required CI checks

At minimum:

```text
npm ci
npm run prisma:validate
npm run prisma:generate
npm run typecheck
npm run test
npm run build
```

As implementation grows, split checks into unit, integration, contract, browser, migration, and security jobs.

CI success does not replace browser review or production-policy verification.

## 17. UI standard

- responsive behavior must be component-owned and tested
- avoid extreme z-index values without a documented layering system
- modal, drawer, popover, composer, and toast layers use central tokens
- responsive state must restore correctly after viewport changes
- channel capabilities determine available composer controls
- loading, empty, error, retry, permission-denied, and disconnected states are required
- accessibility labels, focus management, and keyboard operation are required

## 18. Documentation standard

Code changes that alter architecture, data model, platform behavior, permissions, policies, or release procedure must update the relevant document in `docs/engageos`.

Architecture decisions that affect multiple modules require an ADR.

## 19. Review checklist

A reviewer should verify:

- module boundary is correct
- no unrelated files changed
- no hidden destructive migration
- tenant scope is enforced
- platform capability and policy are respected
- idempotency exists for external events/actions
- error/retry behavior is defined
- secrets and personal data are protected
- tests cover success, failure, duplicate, unauthorized, and rollback cases
- feature can be disabled safely

## 20. Deployment standard

No deployment is implied by merge.

Before production activation:

- exact source commit is identified
- database backup is verified
- migration status is known
- environment validation passes
- feature flags default safely
- rollback procedure is ready
- PM2/Nginx process targets are confirmed
- smoke test scope is approved

After activation:

- capture live commit
- capture process health
- verify public and local endpoints
- verify error/queue dashboards
- confirm no duplicate sends
- record phase evidence
