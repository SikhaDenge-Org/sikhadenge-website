# Email Automation Phase Lock

Locked: 2026-09-14
Canonical app: `apps/whatsapp-agent-dashboard`
Canonical module: `apps/whatsapp-agent-dashboard/modules/email-automation`

These phases are ordered. A later phase may prepare contracts early, but production behavior must not bypass the exit gates of earlier phases.

## E0 — Module Foundation and Governance

Scope:
- canonical isolated module boundary
- provider-neutral domain contracts
- runtime modes and safety gates
- sender-resolution rules
- template lifecycle contracts
- audit/idempotency primitives
- phase manifest and architecture decisions

Exit gate:
- no live external sends
- no provider secrets exposed to UI/logs
- all email-specific new code lives in the canonical module
- type-safe contracts for connection, sender, template and message

## E1 — Gmail / Google Workspace Connections and Multi-Sender

Scope:
- Google OAuth authorization contract
- encrypted access/refresh token persistence through approved credential infrastructure
- multiple provider connections per workspace
- Gmail account identity verification
- send-as alias discovery
- sender verification/readiness
- default sender selection
- connection revoke/reconnect
- read-only health checks

Exit gate:
- connect/reconnect/revoke works in test environment
- secrets are never returned in public DTOs
- sender library supports multiple accounts and aliases
- no unrestricted customer sending

## E2 — Advanced Email Template Studio

Scope:
- template CRUD
- immutable version history
- DRAFT -> IN_REVIEW -> APPROVED -> ARCHIVED lifecycle
- subject, preheader, HTML and plain-text fallback
- reusable personalization variables
- structured content blocks plus HTML mode
- inline media library
- file attachments
- desktop/mobile preview
- test rendering
- template default sender

Exit gate:
- approved templates validate required variables/assets
- old queued messages keep immutable rendered snapshots
- unsafe/unapproved content cannot be used by live automation

## E3 — Manual Transactional Email

Scope:
- composer
- sender switcher
- To/CC/BCC/Reply-To
- template selection and overrides
- attachments
- dry-run
- internal-recipient mode
- provider dispatch adapter
- delivery/audit record
- retry classification

Exit gate:
- internal test recipients only
- idempotent message creation
- provider failures produce normalized errors
- kill switch stops external dispatch

## E4 — Lead and CRM Automation

Scope:
- NEW_LEAD
- CONTACT_CREATED
- FORM_SUBMITTED
- STAGE_CHANGED
- TAG_ADDED
- FOLLOW_UP_DUE
- PAYMENT_PENDING / PAYMENT_PAID
- APPOINTMENT_CREATED / APPOINTMENT_REMINDER
- SEND_EMAIL action
- wait/condition/schedule
- per-step sender/template override
- duplicate-trigger protection

Exit gate:
- one lead event cannot generate duplicate welcome email
- automation can be simulated without external sends
- approved-template and sender-readiness gates are enforced
- limited-cohort rollout available

## E5 — Inbound Email and Unified Inbox

Scope:
- Gmail watch/history synchronization
- inbound message normalization
- thread mapping
- reply/reply-all
- inbound attachments
- customer/lead timeline
- unified Inbox email channel
- EMAIL_RECEIVED / EMAIL_REPLIED triggers

Exit gate:
- provider event replay is idempotent
- threads map to correct customer/workspace
- inbound processing cannot cross workspace boundaries

## E6 — Campaigns, Sequences and Lifecycle Journeys

Scope:
- segmented audience
- reusable lifecycle sequences
- sender-pool selection
- scheduling
- throttling/rate limits
- frequency caps
- pause/resume/cancel
- suppression/unsubscribe
- per-recipient execution state

Exit gate:
- bulk delivery honors consent/suppression
- campaign pause prevents new dispatch
- sender/provider limits are enforced

## E7 — Analytics, Deliverability and Optimization

Scope:
- sent/delivered/bounced/replied
- open/click when technically/legal-policy appropriate
- sender health
- domain health
- template performance
- automation performance
- funnel/conversion attribution
- operational alerting

Exit gate:
- metrics are derived from canonical message/event records
- provider-specific events normalize into common definitions
- dashboards distinguish queued/sent/delivered/replied/failed

## E8 — Multi-Provider Expansion

Scope:
- Microsoft 365 / Graph
- Brevo and/or Amazon SES / Resend when justified
- provider routing/failover policy
- provider-specific capabilities without leaking into core domain

Exit gate:
- provider adapters pass the same contract suite
- switching provider does not require template or automation rewrites
- credentials remain isolated per connection/workspace

## Locked sender precedence

1. manual message override
2. automation-step override
3. template default sender
4. workspace default sender

An inactive/unverified resolved sender fails closed.

## Locked runtime progression

`DISABLED -> DRY_RUN -> INTERNAL_RECIPIENTS -> LIMITED_COHORT -> LIVE`

No phase may jump directly from disabled development code to unrestricted live delivery.

## Locked template lifecycle

`DRAFT -> IN_REVIEW -> APPROVED -> ARCHIVED`

Only approved template versions may execute in live automation.

## Locked product rule

Email is a first-class EngageOS channel sharing the existing Customer/Lead identity. Do not create a second email-only CRM contact database.
