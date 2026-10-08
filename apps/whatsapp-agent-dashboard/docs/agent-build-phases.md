# SikhaDenge WhatsApp AI Agent — Production Build Phases

This application remains isolated inside `apps/whatsapp-agent-dashboard`. The existing SikhaDenge dashboard and its PM2 process must not be modified.

## Operating principles

- WhatsApp-first Hindi, English and Hinglish communication.
- Approved knowledge is the source of truth for fees, batches, certificates, offers, policies and commitments.
- The agent may reason internally, but it stores and exposes only a short decision summary—not private chain-of-thought.
- Low-confidence, payment, refund, complaint, legal and explicit-human requests move to a counselor.
- Permanent learning requires manager/admin approval.
- Outbound WhatsApp delivery remains disabled until the final Meta/AiSensy cutover.
- Every phase must pass typecheck, build and rollback checks before deployment.

## Phase 1 — Agent Core and safe preview

Status: implemented on `feature/whatsapp-ai-agent-roadmap`.

- Language detection for Hindi, English and Hinglish.
- Deterministic intent classifier and high-risk routing.
- Prompt-injection and sensitive-data checks.
- Approved-knowledge lexical retrieval.
- OpenAI Responses API adapter with structured output and `store: false`.
- RAG orchestration with confidence threshold and no-answer protection.
- Conversation/contact/lead context loader.
- Authenticated preview API that never sends a WhatsApp message.
- Smoke checks for core routing and safety behavior.

Preview endpoint:

```text
POST /api/agent/preview
```

Example authenticated request:

```json
{
  "message": "AI Expert course ki fees aur next batch kab hai?",
  "conversationId": "optional-existing-conversation-id"
}
```

The response always includes `previewOnly: true` and `outboundSent: false`.

Required runtime variables for model-backed previews:

```text
OPENAI_API_KEY=<server-secret>
OPENAI_MODEL=gpt-5-mini
OPENAI_TIMEOUT_MS=25000
AGENT_AUTO_REPLY_CONFIDENCE=0.78
AGENT_KNOWLEDGE_MIN_SCORE=0.18
AGENT_MAX_REPLY_CHARACTERS=1200
AGENT_MAX_HISTORY_MESSAGES=16
AGENT_MAX_KNOWLEDGE_CHUNKS=5
```

Do not commit secrets or print them in logs.

## Phase 2 — RAG ingestion and knowledge operations

Status: implemented on `feature/whatsapp-ai-agent-roadmap`.

- Knowledge upload/import workflow.
- Normalization, deduplication, chunking and checksums.
- Versioning, effective dates and approval workflow.
- Optional embeddings with hybrid lexical/semantic retrieval.
- Active-version archival and audit logging.
- Authenticated ingestion, review and search APIs.
- Content-preservation smoke tests.

## Phase 3 — Conversation memory and lead intelligence

Status: implemented on `feature/whatsapp-ai-agent-roadmap`.

- Durable redacted conversation summaries in `aiSummary`.
- Explicit contact, course, goal, timeline and availability memory.
- Deterministic lead score, temperature and non-regressive stage transitions.
- Automatic `REVIEW_REQUIRED` mode for low-confidence or handoff decisions.
- Opt-out persistence and counselor-request tracking.
- Authenticated analysis endpoint with audit logging.
- No outbound WhatsApp message is sent by this phase.

Analysis endpoint:

```text
POST /api/agent/conversations/{conversationId}/analyze
```

An optional `message` may be supplied; otherwise the latest inbound customer text is analyzed. The response always includes `outboundSent: false`.

## Phase 4 — Counselor handoff and operations

Status: implemented on `feature/whatsapp-ai-agent-roadmap`.

- Validated AI/HUMAN/REVIEW_REQUIRED/PAUSED mode transitions.
- Validated OPEN/WAITING/RESOLVED/CLOSED/SPAM status transitions.
- Counselor self-assignment and manager/admin assignment controls.
- Conversation and lead assignee synchronization.
- Internal lead notes, conversation tags and follow-up scheduling.
- Derived SLA state, priority score and operational priority band.
- Due, unassigned and counselor-specific queue filters.
- Audit logging with actor, IP address, user agent and before/after state.
- No outbound WhatsApp message is sent by this phase.

Operations endpoints:

```text
POST /api/conversations/{conversationId}/mode
POST /api/conversations/{conversationId}/assignment
POST /api/conversations/{conversationId}/status
POST /api/conversations/{conversationId}/follow-up
POST /api/conversations/{conversationId}/notes
POST /api/conversations/{conversationId}/tags
GET  /api/operations/queue
```

All write responses include `outboundSent: false`. Queue filters support `assignedToId`, `unassigned`, `due` and `limit` query parameters.

## Phase 5 — Controlled learning

Status: implemented on `feature/whatsapp-ai-agent-roadmap`.

- Automatic pending-candidate capture only for low-confidence, missing-approved-knowledge and model-unavailable decisions.
- Manual counselor correction capture with admin/manager review.
- OTP, payment number, phone, email, Aadhaar and secret redaction before storage.
- Raw customer content is not stored in learning metadata.
- Auto-captured candidates require a reviewed corrected answer before approval.
- Pending-suggestion and approved-knowledge duplicate protection.
- Approved corrections become versioned `HUMAN_APPROVED_LEARNING` knowledge.
- Earlier approved versions in the same reviewed-learning category are archived.
- Complete create, reject, approve and merge audit events.
- No outbound WhatsApp message is sent by this phase.

Learning endpoints:

```text
GET  /api/learning
POST /api/learning
POST /api/learning/{suggestionId}/review
```

Counselors may create redacted pending suggestions. Only managers and admins may list the review queue or approve/reject suggestions. Approval responses include `outboundSent: false`.

## Phase 6 — WhatsApp outbound delivery

Status: guarded delivery foundation implemented on `feature/whatsapp-ai-agent-roadmap`; live sending remains disabled.

- Durable outbound queue using existing message and webhook-event records.
- Idempotency reservation before queue creation.
- Free-form text allowed only inside the stored service window.
- Approved templates required outside the service window.
- Opt-out, paused, closed, spam and invalid AI-mode protections.
- Meta Cloud API text and template payload builder.
- Sent, failed, delivered and read reconciliation through existing message status records and webhooks.
- Retriable failure handling with capped attempts.
- `disabled`, `dry_run` and dual-confirmation `live` modes.
- Independent live-send acknowledgement and global kill switch.
- Queueing does not change customer-visible conversation state until Meta accepts the message.

Outbound endpoints:

```text
POST /api/conversations/{conversationId}/send
POST /api/outbound/dispatch
```

The first endpoint queues a counselor text/template request with an idempotency key. The second is manager/admin-only. In the current default configuration it cannot send a live WhatsApp message.

## Phase 7 — Evaluation, observability and cost control

Status: implemented on `feature/whatsapp-ai-agent-roadmap`.

- Golden Hindi, English and Hinglish routing/safety regression suite.
- Agent decision source tracking for rule, fallback and model paths.
- Total latency, model latency, token usage and optional estimated-cost telemetry.
- Configurable primary/fallback models with bounded output tokens.
- Runtime agent kill switch and independent model-call switch.
- Redacted structured operational audit values and compact errors.
- Handoff, confidence, latency, safety, knowledge, learning and outbound metrics.
- Admin/manager/analyst observability endpoint with no raw customer message content.
- Regression smoke gates for evaluation, runtime controls, cost estimation and PII redaction.

Observability endpoint:

```text
GET /api/observability/agent?days=7
```

Optional runtime controls:

```text
AGENT_ENABLED=true
AGENT_KILL_SWITCH=off
AGENT_MODEL_CALLS_ENABLED=true
OPENAI_FALLBACK_MODEL=<optional-model>
OPENAI_MAX_OUTPUT_TOKENS=1200
OPENAI_INPUT_COST_PER_1M_USD=0
OPENAI_OUTPUT_COST_PER_1M_USD=0
```

Cost rates default to zero so the application does not invent pricing. Set rates from the active provider contract when cost estimates are required.

## Phase 8 — Final Meta/AiSensy Cutover & Native Cloud Gateway

Status: In progress / Stage gates active.

- Complete SIM verification and resolve telecom security hold on production number.
- Verify production WABA (WhatsApp Business Account) binding, System User access token, and Phone Number ID.
- Register two-step verification PIN via Graph API / WhatsApp Business Manager.
- Dual-channel migration strategy: zero message loss during AiSensy to native Meta Cloud API cutover.
- Idempotency-backed webhook migration with parallel event buffering.
- Standalone number validation for pre-cutover end-to-end testing (template + freeform responses).
- Operational rollback runbook with instantaneous fallback to webhook proxy.

Cutover endpoints:

```text
GET  /api/cutover/readiness
POST /api/cutover/outbound-approvals
POST /api/cutover/governance-readiness
POST /api/cutover/approved-flows
POST /api/cutover/controlled-launch
```

Cutover verification checklist:

1. `GET /api/cutover/readiness` returns all checks green (`wabaConfigured`, `pinVerified`, `templatesApproved`).
2. High-risk outbound dispatch requires dual-signature approval via `/api/cutover/outbound-approvals`.
3. Meta webhook subscription active on `/api/webhooks/whatsapp` with verified `hub.verify_token`.

## Phase 9 — Hardening, Security, and Reliability

Status: Implemented in core modules; active in staging verification.

- **Webhook Signature Verification:** Strict HMAC-SHA256 signature validation (`X-Hub-Signature-256`) against Meta app secret on all inbound events.
- **CSRF & Session Hardening:** Strict SameSite cookies, CSRF protection on authenticated dashboard mutations, and timing-safe secret comparisons.
- **Data Protection & Zero-PII Leakage:**
  - Automated redaction of OTPs, cards, phone numbers, emails, government IDs, and payment screenshots before database storage.
  - Raw customer prompt logs and private reasoning tokens are strictly excluded from analytics/observability views.
- **Queue Fault Tolerance & Dead-Letter Handling:**
  - Exponential backoff with jitter on transient Meta API 429/500 errors.
  - Failed messages quarantine in dead-letter table after 3 retries without blocking active conversations.
  - Idempotency locks prevent duplicate outbound deliveries on network retries.
- **Database Backup & Disaster Recovery:**
  - Automated continuous PostgreSQL WAL archiving and daily snapshot validation.
  - Documented restore drill with RPO < 15 minutes and RTO < 30 minutes.

Security & System Health Endpoints:

```text
GET  /api/meta/status
GET  /api/integrations/health
POST /api/integrations/verify
```

## Phase 10 — Controlled Production Launch & Governance

Status: Rollout framework ready.

### Rollout Ladder

1. **Stage 1 (Internal Pilot):** Internal team test phone numbers only; full conversation flow verification.
2. **Stage 2 (Supervised Shadow Mode):** Incoming production leads generate AI recommendations visible only to human counselors in dashboard; zero auto-send.
3. **Stage 3 (Restricted FAQ Auto-Reply):** Autonomous agent enabled strictly for verified high-confidence intents (Free Masterclass schedule, zero coding reassurance, device eligibility).
4. **Stage 4 (Full Inbound Autonomous Qualification):** End-to-end inbound counselor handles objection handling, dynamic slot dispatch, and community onboarding.
5. **Stage 5 (Hybrid Counselor Escalation):** Automated handoff to live staff on payment issues, complaints, or explicit human requests within SLA limits.
6. **Stage 6 (Targeted Outbound Campaigns):** Template-based event reminders and re-engagement campaigns within Meta 24-hour service window rules.

### Production Launch Gates

- [x] Local Open-Source AI Engine (`@sikhadenge/ai` / Qwen 4B on port 3210) validated with sub-15s response latency.
- [x] Dynamic Schedule Engine (`getNextMasterclassSlot`) active with zero stale slot caching.
- [x] Two-Tier Executive Card Formatter wired to WhatsApp outbound dispatch.
- [ ] Meta Business Manager WABA payment method and compliance review active.
- [ ] Emergency Kill Switch verified: `AGENT_KILL_SWITCH=on` instantly forces 100% human counselor mode without process restarts.

```text
Global Kill Switch:
AGENT_ENABLED=true
AGENT_KILL_SWITCH=off
AGENT_AUTONOMOUS_MODE=active
```
