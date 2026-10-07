# SikhaDenge WhatsApp AI Agent — Implementation Roadmap

Target: `https://dashboard.sikhadenge.in/`

Architecture principle: SikhaDenge-owned application, database, inbox, analytics, AI orchestration and administration. Meta WhatsApp Cloud API remains the transport layer required to send and receive WhatsApp messages. No AiSensy, n8n or third-party chatbot dashboard is used.

## Current technical baseline

- Next.js 14 application
- TypeScript
- Tailwind CSS
- Prisma ORM
- PostgreSQL database
- Existing `Lead` and `Admission` models
- Existing Meta WhatsApp Business Account and production phone number
- Dedicated Meta App and System User already created

## Phase 0 — Discovery, security and deployment contract

Goal: freeze the production environment before changing code.

Deliverables:

- Confirm the exact GitHub repository and deployment branch used by `dashboard.sikhadenge.in`.
- Confirm VPS process name, application path, PM2 configuration and Nginx virtual host.
- Inventory current authentication, dashboard routes and database migrations.
- Create a separate staging route or hostname for testing.
- Define required environment variables without committing secrets.
- Rotate any access token previously exposed in screenshots.
- Confirm production WhatsApp Business Account ID and phone-number ID.
- Define backup and rollback procedure.

Exit criteria:

- Staging build works.
- Database backup exists.
- No production secret is stored in GitHub.
- Deployment and rollback commands are documented.

## Phase 1 — Dashboard product design and application shell

Goal: build the AiSensy-style operating interface before connecting live WhatsApp traffic.

Pages:

1. `/whatsapp/inbox`
   - Three-column inbox layout
   - Conversation list
   - Active chat thread
   - Lead/contact details panel
   - Search, unread, assigned-to-me and lead-status filters
   - AI ON/OFF indicator
   - Human takeover button

2. `/whatsapp/contacts`
   - Contact directory
   - Tags, source, course interest, lead score and owner

3. `/whatsapp/leads`
   - New, Qualified, Hot, Warm, Nurture, Enrolled and Closed pipeline

4. `/whatsapp/templates`
   - Local template registry
   - Meta approval status
   - Category and language

5. `/whatsapp/analytics`
   - New conversations
   - Messages sent, delivered, read and failed
   - AI resolution rate
   - Human takeover rate
   - Qualified leads
   - Demo bookings
   - Admissions and revenue attribution

6. `/whatsapp/settings`
   - Meta connection status
   - Agent rules
   - Business hours
   - Escalation rules
   - Counselors and permissions

Design requirements:

- SikhaDenge brand palette
- Desktop-first operations panel with responsive tablet/mobile fallback
- Clear delivery-status indicators
- Accessible keyboard navigation
- Loading, empty, error and disconnected states
- No live API calls in this phase; realistic seeded/mock data only

Exit criteria:

- Complete dashboard shell is reviewable on staging.
- All primary pages and states are navigable.
- User approves the inbox and analytics design.

## Phase 2 — Database and domain foundation

Goal: create a durable message and lead data model.

Core models:

- `WhatsAppContact`
- `WhatsAppConversation`
- `WhatsAppMessage`
- `WhatsAppMessageStatus`
- `WhatsAppMedia`
- `WhatsAppTemplate`
- `WhatsAppWebhookEvent`
- `AgentConfiguration`
- `AgentRun`
- `HumanAssignment`
- `LeadActivity`
- `OptInRecord`
- `OptOutRecord`
- `AuditLog`

Important constraints:

- Meta message IDs must be unique.
- Webhook processing must be idempotent.
- Raw webhook payloads must be retained for diagnostics with a retention policy.
- Contact phone numbers must be normalized to E.164.
- Existing `Lead` and `Admission` records must be linked rather than duplicated.
- All counselor and configuration changes must create audit records.

Exit criteria:

- Prisma migration passes on staging.
- Seed data populates the dashboard.
- Duplicate webhook/message tests pass.

## Phase 3 — Meta webhook receiver and outbound messaging

Goal: receive and send real WhatsApp messages through SikhaDenge infrastructure.

Endpoints:

- `GET /api/whatsapp/webhook` — Meta verification challenge
- `POST /api/whatsapp/webhook` — incoming events
- `POST /api/whatsapp/messages` — authenticated dashboard send endpoint
- `POST /api/whatsapp/templates/send` — approved template sending
- `GET /api/whatsapp/health` — connection and configuration health

Processing pipeline:

1. Verify webhook signature.
2. Persist raw event.
3. Deduplicate event.
4. Resolve contact and conversation.
5. Store message or status update.
6. Update unread and delivery state.
7. Queue AI or human workflow.
8. Return HTTP 200 quickly.

Outbound requirements:

- Secure server-side access token only
- Approved Graph API version stored in configuration
- Delivery/read/failure status tracking
- Retry policy for transient errors
- No automatic retry for policy or recipient errors
- Rate limiting and audit logs

Exit criteria:

- Test number can send and receive.
- Production number receives a controlled inbound test.
- Message statuses update correctly.
- Failed messages show actionable errors in the dashboard.

## Phase 4 — Live inbox and human operations

Goal: make the dashboard usable by counselors.

Features:

- Near-real-time inbox using Server-Sent Events or WebSockets
- Manual text and approved-template sending
- Media preview and download controls
- Assignment to counselor
- Internal notes
- Tags and lead-stage updates
- Follow-up date
- Conversation close/reopen
- Human takeover and return-to-AI
- Collision protection when two counselors open the same conversation

Exit criteria:

- Two logged-in users can operate the inbox safely.
- New incoming messages appear without page refresh.
- Human takeover prevents AI from replying.

## Phase 5 — AI admissions agent

Goal: automate course guidance and lead qualification using controlled SikhaDenge data.

Agent responsibilities:

- Hindi, Hinglish and English intent detection
- Course FAQ answers
- User-goal and profile capture
- Program recommendation
- Lead qualification and scoring
- Objection classification
- Conversation summary
- Escalation to human counselor

Controlled architecture:

- Deterministic business rules for prices, offers, schedules, payment links and lead stages
- Retrieval only from approved SikhaDenge knowledge sources
- Structured JSON output validated server-side
- Confidence threshold and mandatory escalation on uncertainty
- Per-conversation AI enable/disable state
- Prompt and model version audit trail

Prohibited agent actions:

- Invent discounts or course content
- Promise jobs, income, certificates or refunds outside policy
- Request OTP, PIN, CVV, password or unnecessary identity documents
- Send marketing messages without valid opt-in

Exit criteria:

- Approved evaluation set passes.
- Hallucination and pricing tests pass.
- AI stops immediately after human takeover.

## Phase 6 — Lead qualification and CRM pipeline

Goal: convert conversations into structured admissions opportunities.

Features:

- Automatic lead creation/update
- Lead score and temperature
- Course interest
- Joining timeline
- Source and campaign attribution
- Demo booking status
- Counselor owner
- Admission and payment status linkage
- Duplicate lead reconciliation
- Conversation-to-admission attribution

Exit criteria:

- Qualified lead is created from a real conversation.
- Existing Lead/Admission records remain consistent.
- Pipeline analytics reconcile with database records.

## Phase 7 — Templates, campaigns and consent compliance

Goal: support compliant business-initiated messaging.

Features:

- Template synchronization from Meta
- Marketing, utility and authentication category visibility
- Audience filters based only on recorded opt-in
- Frequency caps
- STOP/unsubscribe processing
- Suppression list
- Campaign preview and approval workflow
- Estimated recipient count and send cost inputs
- Batch throttling and failure reporting

Exit criteria:

- No opted-out contact can be targeted.
- Every campaign has creator, approver and audit record.
- Template and consent validation blocks non-compliant sends.

## Phase 8 — Analytics and management reporting

Goal: provide operational and conversion intelligence.

Metrics:

- First response time
- AI response latency
- AI resolution rate
- Human takeover rate
- Unread backlog
- Delivery/read/failure rate
- Lead qualification rate
- Hot-lead rate
- Demo-booking rate
- Admission conversion
- Revenue by source, course, counselor and campaign
- Opt-out and block rates
- Policy-risk indicators

Exit criteria:

- Daily totals reconcile with message and lead tables.
- Filters work by date, source, course and counselor.
- CSV export respects user permissions.

## Phase 9 — Security, reliability and production hardening

Goal: make the system production-safe.

Controls:

- Role-based access control
- Secure encrypted environment secrets
- Webhook signature verification
- CSRF protection for dashboard actions
- Rate limits
- Input validation
- Audit logs
- Database backups
- Queue and dead-letter handling
- Monitoring and alerts
- Token-expiry and webhook-health alerts
- Data retention and deletion procedures
- Incident runbook

Exit criteria:

- Security review passes.
- Restore test passes.
- Load test and webhook retry tests pass.
- Production rollback is tested.

## Phase 10 — Controlled production launch

Rollout:

1. Internal test contacts only
2. AI suggestions visible but not automatically sent
3. AI auto-reply for a restricted FAQ set
4. AI qualification for opted-in new leads
5. Full counselor workflow
6. Gradual campaign capability after compliance review

Launch gates:

- No unresolved Meta policy restriction
- Correct production WABA and phone-number ID
- Stable payment method
- Valid system-user token stored on server
- Monitoring operational
- User approval before DNS, webhook or production behavior changes

## Immediate execution order

1. Complete Phase 0 repository/deployment discovery.
2. Create Phase 1 dashboard design on a feature branch.
3. Deploy Phase 1 to staging for user approval.
4. Only after design approval, proceed to database migration and live webhook integration.
