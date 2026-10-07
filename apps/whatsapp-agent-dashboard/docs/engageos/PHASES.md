# EngageOS Locked Execution Phases

## Execution rule

Only one phase may be active at a time. Each phase requires repository evidence for design, implementation, tests, review, and completion. Passing a phase does not authorize production deployment unless the phase explicitly includes a controlled release.

## Standard workflow for every implementation phase

```text
1. Confirm current branch and baseline commit
2. Write or update technical design
3. Define API and data contracts
4. Create feature branch
5. Implement backend/domain work
6. Implement UI work
7. Add unit tests
8. Add integration/contract tests
9. Add browser tests where user behavior changes
10. Run security and tenant-isolation review
11. Open draft PR
12. Resolve review findings
13. Pass CI
14. Test in shadow/staging mode
15. Document rollback
16. Obtain explicit production approval
17. Deploy in controlled scope
18. Capture smoke-test evidence
19. Lock phase completion
```

---

# Phase 0 — Stabilization and truth baseline

## Objective

Establish one verified source of truth for GitHub, VPS, PM2, database migrations, webhooks, and current WhatsApp/Instagram/Messenger behavior.

## Deliverables

- read-only VPS branch and HEAD verification
- production branch and release branch comparison
- unresolved review findings inventory
- current environment-variable name inventory without secret values
- current Prisma migration status
- current webhook endpoint inventory
- current channel capability matrix
- authenticated Inbox regression suite
- mobile/tablet/desktop composer fixes
- production rollback runbook

## Exit gate

- canonical implementation base selected
- no unknown live commit
- existing critical review findings resolved
- clean TypeScript, Prisma validation, production build, and targeted browser tests
- existing WhatsApp flows remain operational
- rollback point and recovery procedure documented

---

# Phase 1 — Omnichannel domain foundation

## Objective

Introduce channel-neutral contracts without removing existing WhatsApp behavior.

## Deliverables

- workspace domain contract
- channel connection and capability contracts
- customer and external identity contracts
- channel-neutral conversation/message/interaction contracts
- normalized channel event envelope
- repository interfaces with workspace context
- additive Prisma design and migration plan
- compatibility mapping from existing WhatsApp models

## Exit gate

- new contracts compile and are unit-tested
- no destructive database change
- existing WhatsApp reads and writes remain unchanged
- tenant-scope tests prove cross-workspace access is blocked
- architecture review approves the data model

---

# Phase 2 — Security, permissions, consent, and kill switches

## Objective

Make platform-wide permissions and outbound safety enforceable before expanding automation.

## Deliverables

- role and granular permission matrix
- workspace membership model
- permission middleware/application checks
- encrypted connection credential storage design
- webhook signature verification contracts
- consent and suppression models
- channel/account/automation/AI/campaign kill switches
- security audit events

## Exit gate

- unauthorized API and UI actions are blocked
- credentials never return to the browser in usable form
- webhook verification and replay-protection tests pass
- suppression prevents all disallowed outbound actions
- kill switches stop queued and new sends according to documented semantics

---

# Phase 3 — Event gateway, durable processing, and retries

## Objective

Process inbound activity reliably without long-running work inside webhook routes.

## Deliverables

- raw event persistence
- deterministic event keys
- normalized event persistence
- queue abstraction and selected Redis-backed implementation
- event worker
- retry classification and exponential backoff
- dead-letter records and admin inspection
- replay command with duplicate-send protection
- correlation IDs and structured logs

## Exit gate

- duplicate webhook produces one business action
- temporary failures retry
- permanent failures enter dead-letter state
- replay does not duplicate messages, replies, or leads
- queue delay and failure metrics are visible

---

# Phase 4 — Integration Control Centre

## Objective

Provide a trustworthy admin surface for connection health and platform capabilities.

## Deliverables

- integration cards
- connection health status
- permission and webhook status
- token expiry/revocation state
- connection test action
- reconnect/disconnect flows
- per-connection outbound pause
- capability registry exposed to UI

## Exit gate

- connected status requires verified API evidence
- disconnect immediately blocks outbound activity
- unsupported capabilities are disabled, not simulated
- expired/revoked credentials produce actionable diagnostics

---

# Phase 5 — Unified Inbox 2.0

## Objective

Provide one channel-neutral conversation workspace for counselors.

## Deliverables

- channel-neutral conversation list query
- unified timeline for messages, comments, notes, assignments, and automation events
- capability-aware composer
- customer intelligence side panel
- filters for channel, assignment, unread, AI/human mode, risk, and SLA
- realtime updates through SSE or approved alternative
- collision warnings for multiple counselors
- responsive component decomposition

## Exit gate

- WhatsApp, Instagram, and Messenger conversations render without leakage
- unsupported send types cannot be submitted
- responsive browser suite passes locked viewports
- failed outbound messages are visible and retryable according to policy

---

# Phase 6 — WhatsApp migration to the omnichannel core

## Objective

Move existing WhatsApp behavior behind the new contracts without data loss.

## Deliverables

- WhatsApp channel adapter
- inbound webhook normalizer
- outbound text/media/template adapters
- delivery/read/failure status mapping
- service-window policy
- migration/backfill script for customer identity and conversation mapping
- dual-read or compatibility strategy
- full regression suite

## Exit gate

- historical contacts, conversations, and messages remain accessible
- new inbound/outbound activity uses the normalized path
- no duplicate contacts or messages
- templates and service-window behavior match production requirements
- rollback to legacy path is documented and tested

---

# Phase 7 — Instagram comments and direct messages

## Objective

Deliver the first complete comment-to-DM automation channel.

## Deliverables

- professional account connection health
- media synchronization
- comment webhook normalization
- post/Reel targeting
- keyword and AI-intent trigger inputs
- public comment reply action
- private reply action
- one-initial-private-reply and time-window policy guards
- customer response transition into DM conversation
- comment moderation and complaint escalation
- per-comment idempotency and flow collision protection
- comment funnel analytics events

## Exit gate

```text
Instagram comment
  -> normalized event
  -> rule match
  -> public reply
  -> private reply
  -> customer DM response
  -> Inbox conversation
  -> CRM lead update
  -> optional human handoff
```

The complete path must pass contract and controlled real-account tests without duplicate replies.

---

# Phase 8 — Facebook Page comments and Messenger

## Objective

Add Page comment engagement and Messenger conversations through the same core.

## Deliverables

- Page/post synchronization
- Page comment events
- public reply and moderation actions
- Messenger inbound/outbound text
- supported media only after capability tests
- Page-to-Messenger origin context
- permission revocation handling
- identity isolation by Page connection

## Exit gate

- Page comments are linked to the correct Page and post
- Messenger conversations remain isolated across connected Pages
- public/private engagement paths pass
- permission loss stops sends and raises diagnostics

---

# Phase 9 — Visual Automation Builder

## Objective

Allow non-technical admins to create safe, versioned workflows.

## Deliverables

- trigger, condition, action, delay, branch, approval, goal, and stop nodes
- typed graph schema
- server-side validation/compiler
- immutable published versions
- draft/publish/pause/archive lifecycle
- execution instance and node state
- simulator using production-equivalent evaluation logic
- loop, recursion, node-count, and execution-duration guards
- rollback to prior published version

## Exit gate

- invalid graph cannot publish
- published flow cannot mutate
- simulator and runtime produce equivalent decisions for locked fixtures
- recursive or duplicate execution is prevented
- every action is auditable

---

# Phase 10 — AI Brain and Knowledge Intelligence

## Objective

Add contextual AI with approved knowledge, confidence policy, evaluation, and controlled learning.

## Deliverables

- intent classification
- language and safety detection
- customer/conversation context builder
- approved knowledge retrieval
- response planner and provider abstraction
- output evaluator
- confidence routing: auto-send, approval, or handoff
- prompt and policy version tracking
- knowledge reference tracking
- prompt-injection protection
- counselor correction review workflow

## Exit gate

- fees, dates, links, policies, refunds, and promises cannot be guessed
- low-confidence or sensitive responses route to human review
- generated replies retain source and evaluation metadata
- learning requires explicit approval and versioning
- benchmark conversation suite meets locked quality thresholds

---

# Phase 11 — Customer 360 CRM and identity graph

## Objective

Unify channel identities safely around one customer and lead lifecycle.

## Deliverables

- customer profile
- channel identities
- consent and suppression timeline
- merge evidence model
- manual merge and unmerge
- lead stages
- explainable rule-based lead score
- notes, tasks, owner, and follow-up
- cross-channel activity timeline

## Exit gate

- no automatic merge based only on name or username
- every merge is explainable and reversible
- lead transitions are audited
- search/filter/export respects workspace and permissions

---

# Phase 12 — Journeys, campaigns, and follow-ups

## Objective

Operate event-based lifecycle communication with scheduling and suppression.

## Deliverables

- journey enrollment and exit conditions
- exact and relative scheduling
- customer timezone and quiet hours
- cancel-on-response and cancel-on-stage-change
- per-customer, per-flow, and per-channel frequency controls
- audience preview
- campaign approval workflow
- tracked links and attribution
- emergency campaign stop

## Exit gate

- customer response cancels obsolete reminders
- opt-out and suppression are enforced before send
- duplicate enrollment and duplicate follow-up are prevented
- campaign test recipients and preview are required before launch

---

# Phase 13 — Analytics and AI Command Centre

## Objective

Create reliable business, AI, and operational metrics from authoritative events.

## Deliverables

- comment-to-conversion funnel
- channel and campaign performance
- lead/demo/enrollment funnel
- counselor performance
- AI auto-resolution, approvals, corrections, and knowledge gaps
- webhook, queue, token, rate-limit, and send-failure health
- reproducible aggregate jobs
- metric definitions document

## Exit gate

- dashboard metrics reconcile with raw events and operational tables
- filters preserve consistent totals
- attribution rules are documented
- analytics does not expose unnecessary personal data

---

# Phase 14 — Additional platform connectors

Each connector is a separate subphase and PR series.

## Phase 14A — YouTube comments

Deliver video sync, comment/reply retrieval, reply actions, moderation, polling checkpoints, quota management, and AI approval mode.

## Phase 14B — Google Business reviews

Deliver location sync, review events, rating-based rules, owner replies, negative-review escalation, and reputation analytics.

## Phase 14C — Threads

Deliver owned content/replies sync, reply actions, moderation controls, and engagement analytics where approved APIs permit.

## Phase 14D — LinkedIn organization engagement

Build and activate only after required organization permissions and product access are verified.

## Phase 14E — TikTok Business engagement

Build and activate only for officially eligible business APIs and approved account permissions.

## Phase 14F — Website chat and forms

Deliver website widget, anonymous session, lead capture, live handoff, file upload, and continuation into supported channels.

## Shared exit gate

- official API capability verified
- permissions and quotas documented
- connector contract tests pass
- disconnect/revocation behavior works
- no unofficial scraping fallback

---

# Phase 15 — Futuristic UI, PWA, and counselor productivity

## Objective

Improve daily operations after core correctness and reliability are proven.

## Deliverables

- installable PWA
- push notifications
- command palette and global search
- keyboard shortcuts
- AI summaries and suggested replies
- translation and voice-note transcription
- SLA and follow-up recommendations
- offline draft recovery
- accessibility and performance budgets

## Exit gate

- no lost drafts
- keyboard and screen-reader workflows pass
- slow-network and reconnect behavior pass
- core counselor actions work on mobile, tablet, and desktop

---

# Phase 16 — SaaS, agency, and enterprise readiness

## Objective

Prepare the internal platform for multiple customer workspaces and commercial operation.

## Deliverables

- strict multi-tenant isolation
- agency parent/client accounts
- white-label branding and custom domains
- usage metering
- plans, seats, limits, and billing data
- public API keys with scopes
- signed outbound webhooks
- developer logs and rate limits

## Exit gate

- tenant penetration tests pass
- billing/usage totals reconcile
- white-label assets and configuration are isolated
- public APIs enforce workspace and scope

---

# Phase 17 — Controlled production launch

## Objective

Activate new capabilities gradually with measurable rollback points.

## Rollout modes

```text
SHADOW
APPROVAL_ONLY
LIMITED_AUTOPILOT
FULL_AUTOPILOT_FOR_APPROVED_FLOWS
```

## Rollout sequence

1. internal test identities
2. one connected account
3. one Instagram post/Reel
4. one keyword automation
5. one counselor group
6. limited real leads
7. broader Instagram coverage
8. Messenger and Facebook Page coverage
9. additional approved channels
10. stable full rollout

## Exit gate

- no critical incident
- no unexplained duplicate sends
- policy and permission compliance confirmed
- monitoring and support runbooks active
- tested rollback available
- production evidence recorded

---

# Locked priority

## Foundation

Phases 0 through 4.

## Core product

Phases 5 through 9.

## Intelligence and business operations

Phases 10 through 13.

## Expansion and commercial readiness

Phases 14 through 17.

No work from a later priority group should bypass a missing foundational control.
