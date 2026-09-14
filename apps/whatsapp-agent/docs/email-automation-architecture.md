# SikhaDenge Email Automation Architecture

Status: Phase 01 architecture baseline
Date: 2026-09-14

## Goal

Build email as a first-class omnichannel channel inside the existing SikhaDenge EngageOS / WhatsApp Agent application. The system must support multiple sender identities, editable reusable templates, media/attachments, automatic lead-triggered messages, manual sending, workflow automation, auditing, analytics and staged production activation.

## Product requirements

1. Multiple email provider connections per workspace.
2. Multiple sender identities per connection.
3. One workspace default sender plus per-template, per-automation and per-message sender override.
4. Sender switching without editing environment variables.
5. Verified sending domains and sender verification state.
6. Separate From, Reply-To, CC and BCC configuration.
7. Reusable email templates with versioning.
8. Editable subject, preheader, HTML, plain text and variables.
9. Media library and file attachments.
10. Lead-created and lead-updated automation triggers.
11. Automatic welcome/registration/follow-up email flows.
12. Manual email compose from contact, lead and inbox views.
13. Draft, test, preview, approval and live states.
14. Delivery, bounce, complaint and reply event ingestion.
15. Per-recipient suppression and unsubscribe controls.
16. Message/audit history with idempotency and retry protection.
17. Channel-aware analytics and conversion attribution.
18. Provider and automation kill switches.

## Domain model

### EmailConnection

Represents an authenticated provider account. Examples: Google Workspace/Gmail, Microsoft 365, Brevo, SES or another transactional provider.

Fields:
- id
- workspaceId
- provider
- displayName
- externalAccountId
- status
- capabilities
- credentialReference
- lastVerifiedAt
- lastSyncAt
- createdAt
- updatedAt

### EmailSenderIdentity

Represents a From identity that can be selected independently of the provider connection.

Fields:
- id
- workspaceId
- connectionId
- fromName
- fromEmail
- replyToEmail
- domain
- verificationStatus
- isDefault
- isActive
- dailyLimit
- metadata
- createdAt
- updatedAt

### EmailTemplate

Reusable content asset.

Fields:
- id
- workspaceId
- name
- category
- status
- version
- subject
- preheader
- htmlBody
- textBody
- defaultSenderIdentityId
- variableSchema
- tags
- createdBy
- approvedBy
- createdAt
- updatedAt

### EmailTemplateAsset

Media and attachments used by a template.

Fields:
- id
- templateId
- kind (INLINE_IMAGE, ATTACHMENT, DOCUMENT)
- fileName
- mimeType
- sizeBytes
- storageKey
- contentId
- publicUrl
- createdAt

### EmailMessage

One outbound or inbound email instance.

Fields:
- id
- workspaceId
- contactId
- leadId
- connectionId
- senderIdentityId
- templateId
- automationRunId
- providerMessageId
- providerThreadId
- direction
- status
- fromEmail
- to
- cc
- bcc
- replyTo
- subject
- htmlBody
- textBody
- variables
- errorCode
- errorMessage
- scheduledAt
- sentAt
- deliveredAt
- openedAt
- clickedAt
- repliedAt
- bouncedAt
- createdAt
- updatedAt

### EmailEvent

Provider delivery/reply events.

Fields:
- id
- workspaceId
- messageId
- providerEventId
- type
- payload
- occurredAt
- receivedAt

## Sender precedence

Resolved sender must follow this deterministic priority:

1. Manual message override
2. Automation step override
3. Template default sender
4. Workspace default sender

If the resolved sender is inactive or unverified, the send must fail safely before an external request is attempted.

## Template lifecycle

DRAFT -> IN_REVIEW -> APPROVED -> ARCHIVED

Only APPROVED templates can be used by live automation.

Template edits create a new version. Existing automation executions keep an immutable rendered snapshot so later template edits cannot mutate already queued email content.

## Editor requirements

The Email Templates UI should include:

- Template library
- Search, category and status filters
- New template
- Clone template
- Version history
- Sender selector
- From name
- Reply-To override
- Subject editor
- Preheader editor
- Drag-and-drop/content block editor
- HTML editor mode
- Plain-text fallback
- Personalization variables
- CTA buttons
- Inline image/media upload
- Attachment upload
- Desktop/mobile preview
- Light/dark email preview where possible
- Test email
- Save draft
- Submit for approval
- Archive

## Automation triggers

Initial email-capable triggers:

- NEW_LEAD
- CONTACT_CREATED
- FORM_SUBMITTED
- STAGE_CHANGED
- TAG_ADDED
- FOLLOW_UP_DUE
- PAYMENT_PENDING
- PAYMENT_PAID
- APPOINTMENT_CREATED
- APPOINTMENT_REMINDER
- NO_REPLY
- SCHEDULE
- WEBHOOK
- EMAIL_RECEIVED
- EMAIL_REPLIED
- EMAIL_BOUNCED

## Automation actions

Initial channel-aware actions:

- SEND_EMAIL
- SEND_MESSAGE (future generic abstraction)
- WAIT
- CONDITION
- ADD_TAG
- REMOVE_TAG
- UPDATE_STAGE
- ASSIGN_COUNSELOR
- CREATE_TASK
- HUMAN_HANDOFF
- END

SEND_EMAIL configuration:

- templateId
- senderIdentityId (optional override)
- subjectOverride (optional)
- replyToOverride (optional)
- cc
- bcc
- attachmentAssetIds
- variableBindings
- schedulePolicy

## Lead-created automation

Required production use case:

NEW_LEAD
  -> verify contact has deliverable email
  -> check suppression/consent policy
  -> resolve sender identity
  -> render approved welcome template
  -> create immutable EmailMessage snapshot
  -> enqueue
  -> provider dispatch
  -> ingest delivery/bounce/reply events
  -> update analytics and timeline

The trigger handler must be idempotent so one lead cannot receive duplicate welcome emails from webhook retries or repeated database events.

## Multi-provider strategy

Phase 1 provider: Google Workspace / Gmail.

Provider interface should remain neutral:

- connect()
- verifyConnection()
- listSenderIdentities()
- sendMessage()
- getMessage()
- getThread()
- listInboundChanges()
- normalizeWebhookEvent()
- revoke()

Later adapters:
- Microsoft 365 / Graph
- Brevo
- Amazon SES
- Resend

## Gmail connection model

Use OAuth 2.0, not a shared password.

Minimum capabilities:
- identity verification
- send email
- read/reply/thread synchronization when inbound email is enabled
- incremental history/watch strategy for inbound changes

Credentials must be stored through the encrypted EngageOS connection credential model. They must never be rendered in the dashboard.

## Safety gates

Independent flags:

- EMAIL_RUNTIME_ENABLED
- EMAIL_EXTERNAL_WRITES_ENABLED
- EMAIL_AUTOMATION_ENABLED
- EMAIL_INBOUND_SYNC_ENABLED
- EMAIL_TRACKING_ENABLED

Production progression:

DISABLED -> DRY_RUN -> INTERNAL_RECIPIENTS -> LIMITED_COHORT -> LIVE

## Deliverability requirements

Before live automation:

- SPF configured
- DKIM configured
- DMARC configured
- verified From domain
- unsubscribe/suppression policy
- bounce handling
- complaint handling for providers that expose complaints
- rate limits
- per-sender daily limits
- retry policy
- warm-up plan for new domains/senders where applicable

## UI pages

Recommended new routes:

- /email
- /email/inbox
- /email/templates
- /email/senders
- /email/automations (may reuse /automation)
- /email/analytics

Where possible, email should also surface in the existing unified Inbox, Contacts, Leads, Campaigns, Automation, Analytics and Integrations pages instead of creating duplicate CRM data.

## First implementation milestones

### Phase E0 - Canonical contracts

- provider-neutral types
- database models/migration
- feature flags
- permissions
- audit events
- no external writes

### Phase E1 - Multi-sender connection manager

- Gmail OAuth connection
- encrypted token persistence
- sender identity discovery
- sender verification/read-only health
- default sender selection

### Phase E2 - Advanced template studio

- template CRUD/versioning
- subject/preheader/html/text
- variables
- inline media
- attachments
- preview/test rendering
- approval lifecycle

### Phase E3 - Manual transactional send

- compose
- sender selector
- recipient/CC/BCC/reply-to
- template selection
- attachments
- dry run
- internal test recipient
- delivery logging

### Phase E4 - Lead-triggered automation

- NEW_LEAD trigger
- SEND_EMAIL action
- idempotency
- schedule/wait/conditions
- editable automation message and template references

### Phase E5 - Inbound email and unified inbox

- provider watch/poll
- thread mapping
- inbound messages
- replies
- attachments
- CRM timeline

### Phase E6 - Campaigns and sequences

- segmented bulk audience
- sender pool selection
- scheduling
- frequency caps
- throttling
- pause/resume/cancel

### Phase E7 - Analytics and deliverability

- sent/delivered/bounced/replied
- open/click where legally and technically appropriate
- sender/domain health
- template/automation performance
- conversion attribution

### Phase E8 - Additional providers

- Microsoft 365
- Brevo/SES/Resend adapters as business requirements justify them

## Non-goals for initial phase

- Do not turn on live external sending during foundation work.
- Do not store provider secrets in template or integration metadata.
- Do not duplicate a learner into separate WhatsApp and Email contact records.
- Do not allow an unapproved template to execute in live automation.
