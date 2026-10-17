# EngageOS Voice Automation — Execution Lock

## Status

Repository foundation only. This document does not authorize live outbound calling, provider writes, production migrations, number provisioning, recording, or production deployment.

Baseline release at foundation start:

- Branch: `release/whatsapp-instagram-agent-flow-20260731`
- Commit: `28b813ca9936fe0b9d3874f7ebf6b0dfeef0b242`

## Objective

Add provider-neutral AI calling to EngageOS so a qualified, consent-eligible lead can enter a deterministic calling journey, speak with specialist AI agents, update the existing CRM stage safely, and transfer to a human counselor with context when policy requires it.

The voice provider is an execution dependency. SikhaDenge remains the source of truth for customer identity, lead stage, consent, suppression, journey state, call state, business outcome, audit evidence, and human ownership.

## Non-negotiable architecture

1. Voice must be workspace scoped.
2. No provider secret may be returned to the browser or stored in plaintext.
3. Provider webhooks must be authenticated where supported, replay-safe, idempotent, and normalized before business logic runs.
4. The LLM may propose lead facts or a stage transition, but a deterministic policy layer must validate and persist it.
5. Only APPROVED SikhaDenge knowledge may be used for fee, schedule, course, admission, policy, or other controlled answers.
6. Existing consent, suppression, kill-switch, feature-flag, controlled-launch, audit, team ownership, and lead-stage controls must be reused rather than bypassed.
7. AI-agent handoff and human transfer are separate operations and must remain separately auditable.
8. Telecom state and business outcome must not be collapsed into one field.
9. Every external call start must have an idempotency key.
10. Production outbound calling is fail-closed by default.

## Canonical flow

`lead.created / lead.stage.changed`
→ eligibility and consent gate
→ voice journey orchestrator
→ select approved agent version for the lead stage
→ enqueue idempotent call job
→ provider adapter starts call
→ provider events normalized into EngageOS
→ live transcript/events update call state
→ approved tools read/write SikhaDenge state
→ deterministic outcome and stage policy
→ next AI agent, retry, nurture, appointment, payment-intent, or human transfer
→ post-call analysis and QA
→ analytics and audit evidence

A new lead must never bypass eligibility controls merely because the desired business behavior is “call immediately.” Immediate means the first eligible queued execution after policy gates pass.

## Specialist agent model

| Role | Main responsibility | Typical lead stages |
| --- | --- | --- |
| `COMPLIANCE_TRIAGE` | Identity, language, call purpose, safe opening, opt-out handling | NEW |
| `QUALIFICATION` | Occupation, experience, goal, joining timeline, availability | NEW, DISCOVERY |
| `PROGRAM_DISCOVERY` | Need discovery and approved program matching | DISCOVERY, QUALIFIED |
| `APPOINTMENT_BOOKING` | Demo/counselling slot booking | QUALIFIED |
| `OBJECTION_AND_FEE` | Approved FAQ, fee and objection handling | DEMO_BOOKED |
| `CONVERSION` | Next-step confirmation, payment-intent or closer handoff | DEMO_BOOKED, PAYMENT_PENDING |
| `HUMAN_TRANSFER` | Warm transfer preparation and counselor context packet | COUNSELOR_ASSIGNED, PAYMENT_PENDING |
| `NURTURE_REACTIVATION` | Controlled follow-up and reactivation | NURTURE |

`ENROLLED` and `CLOSED` have no default sales-calling agent.

## Allowed voice tools

Voice agents must use an allowlisted, schema-validated tool registry. Initial tool surface:

- `readLeadContext`
- `readContactConsent`
- `searchApprovedKnowledge`
- `updateLeadFacts`
- `proposeLeadStage`
- `scheduleAppointment`
- `requestHumanTransfer`
- `recordCallbackRequest`
- `recordOptOut`
- `endCall`

No voice agent receives a generic arbitrary-HTTP tool in the first production release.

## Provider adapter contract

Every provider implementation must expose the same SikhaDenge interface:

- start outbound call
- transfer between AI agents where supported
- transfer to phone or SIP human destination
- cancel call
- verify webhook
- normalize provider events
- declare supported capabilities

Business rules may depend on capabilities, not on provider names.

Examples of capability flags:

- `OUTBOUND_CALL`
- `LIVE_TRANSCRIPT`
- `POST_CALL_ANALYSIS`
- `AI_AGENT_HANDOFF`
- `HUMAN_PHONE_TRANSFER`
- `HUMAN_SIP_TRANSFER`
- `WARM_TRANSFER`
- `VOICEMAIL_DETECTION`
- `CALL_RECORDING`
- `CUSTOM_TELEPHONY`

## Voice state model

Telecom/call lifecycle examples:

`QUEUED → DIALING → RINGING → CONNECTED → AI_ACTIVE → AI_HANDOFF / HUMAN_TRANSFER_PENDING → HUMAN_ACTIVE → COMPLETED`

Terminal/exception states include:

- `ELIGIBILITY_BLOCKED`
- `NO_ANSWER`
- `BUSY`
- `VOICEMAIL`
- `FAILED`
- `CANCELLED`
- `OPTED_OUT`
- `SUPPRESSED`

Business outcomes are recorded separately, for example:

- qualified
- unqualified
- not interested
- callback requested
- demo booked
- payment intent
- human transferred
- enrolled
- opted out
- wrong number

## Persistence target for Voice V1

Use additive, workspace-scoped persistence. Exact names may change during schema review, but the data responsibilities are locked:

- voice agent definition
- immutable voice agent version
- voice journey definition/version
- call record
- provider call reference
- call event ledger
- transcript segments or redacted transcript reference
- post-call analysis/outcome
- AI-agent handoff record
- human-transfer record
- retry/callback schedule
- provider/number assignment metadata

Every tenant-owned record must carry or inherit a verifiable `workspaceId` boundary. Provider event identifiers must support idempotent ingestion.

## UI target

Do not create a second CRM. Voice is a first-class EngageOS channel and must extend existing modules.

### New Voice module

Recommended routes:

- `/voice` — command center
- `/voice/agents` — specialist agents and immutable versions
- `/voice/journeys` — stage routing and call automation
- `/voice/calls` — live and recent call operations
- `/voice/qa` — transcript, evaluation, outcome and agent-version QA
- `/voice/compliance` — eligibility, consent, number/provider readiness and kill switches

### Existing-page extensions

- Inbox: call timeline, transcript/summary, voice channel filter
- Contacts: call eligibility, last call, call action, consent visibility
- Leads: call state, current voice agent, outcome, next retry, manual test-call action
- Team: transfer-pending queue and warm-transfer context
- Automation: voice trigger/action nodes
- Analytics: connection rate, qualification rate, transfer rate, cost and stage-conversion metrics
- Integrations: telephony/voice provider health and verified configuration
- Settings/Admin: runtime gates, concurrency caps, kill switches and audit evidence

## Automation nodes to add

Existing generic automation primitives remain valid. Voice-specific nodes should be additive:

- `PLACE_AI_CALL`
- `VOICE_AGENT_HANDOFF`
- `WAIT_FOR_CALL_OUTCOME`
- `BRANCH_ON_CALL_OUTCOME`
- `RETRY_CALL`
- `WARM_HUMAN_TRANSFER`
- `END_VOICE_JOURNEY`

Existing `NEW_LEAD`, `STAGE_CHANGED`, `FOLLOW_UP_DUE`, `NO_REPLY`, `SCHEDULE`, `WEBHOOK`, `WAIT`, `CONDITION`, `UPDATE_STAGE`, `ASSIGN_COUNSELOR`, and `HUMAN_HANDOFF` should be reused.

## Operational metrics

Minimum production metrics:

- eligible leads
- blocked leads by reason
- dial attempts
- connection rate
- human-answer rate
- no-answer/busy/voicemail rate
- average talk duration
- AI-agent handoff count
- human-transfer requested / connected / failed
- qualification rate
- demo-booked rate
- payment-intent rate
- opt-out rate
- stage conversion by agent version
- provider/STT/TTS latency where available
- call failure rate and provider error codes
- minutes and cost by workspace/provider/agent version
- post-call analysis completion rate

## India production compliance gate

Before any commercial AI outbound calling is enabled in India, the production rollout must have documented evidence for the applicable telecom and commercial-communication requirements, including consent/preference handling, registered sender/telemarketer setup where required, approved calling number/series and originating-access-provider requirements, calling purpose declaration for autodialer/robocall use where applicable, DND/UCC suppression, opt-out handling, lawful recording/transcription notice where recording is used, and auditable evidence of the policy decision.

This repository phase must not infer compliance from possession of a phone number alone.

## Phase sequence

### Voice V0 — Contracts and execution lock

Deliver:

- provider-neutral voice domain vocabulary
- deterministic lead-stage transition guard
- fail-closed call eligibility contract
- provider capability contract
- specialist-agent stage map
- architecture and rollout lock

No external call is made.

### Voice V1 — Persistence and event foundation

Deliver:

- additive Prisma models/migration
- workspace isolation
- voice event idempotency
- call and outcome ledgers
- transcript/recording retention metadata
- schema and isolation tests

No production migration is executed.

### Voice V2 — Provider integration in safe mode

Deliver:

- provider adapter
- encrypted credential integration using existing EngageOS credential boundary
- verified webhook ingestion
- provider health/readiness check
- normalized call-event mapping
- test/sandbox execution only

### Voice V3 — Single-lead controlled call

Deliver:

- manual, role-protected test call from a lead
- eligibility preview before call
- one AI agent
- transcript and summary persistence
- deterministic outcome proposal
- no automatic new-lead trigger yet

### Voice V4 — New-lead automation and retry engine

Deliver:

- `NEW_LEAD → eligibility → PLACE_AI_CALL`
- quiet/calling-window enforcement
- concurrency/rate caps
- no-answer, busy and provider-failure retry policies
- cancellation when consent/stage changes
- exact dashboard call state

### Voice V5 — Multi-agent stage orchestration

Deliver:

- multiple specialist agent versions
- allowed AI-agent handoff graph
- same-call context handoff where provider supports it
- cross-call stage continuation where it does not
- approved-knowledge grounding
- agent-version QA and rollback

### Voice V6 — Human warm transfer

Deliver:

- counselor eligibility/presence check
- transfer-pending Team queue
- context summary packet
- phone/SIP transfer adapter
- warm transfer when supported, safe fallback when not
- collision-safe ownership update
- explicit transfer success/failure evidence

### Voice V7 — Command center, QA and analytics

Deliver:

- Voice command center
- live call monitor
- call history and transcript QA
- funnel and stage analytics
- agent-version comparison
- cost/minute and conversion economics
- failure and compliance dashboards

### Voice V8 — Controlled production rollout

Deliver:

- provider and telephony production readiness evidence
- India compliance evidence
- consent/suppression penetration tests
- kill-switch drills
- concurrency canary
- limited allowlisted production cohort
- rollback evidence
- monitoring and alert thresholds
- explicit approval before broader outbound activation

## Completion vocabulary

- `repository implemented` does not mean `provider configured`
- `provider configured` does not mean `telephony compliant`
- `telephony compliant` does not mean `production approved`
- `production approved` does not mean `full rollout`

Each state requires its own evidence.
