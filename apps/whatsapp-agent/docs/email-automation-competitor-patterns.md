# Email Automation Competitor Patterns

Research date: 2026-09-14

This document records product patterns to adopt, not vendor-specific implementation details.

## Patterns worth adopting

### Sender identities

Modern email automation products allow a reusable sender library rather than hard-coding one From address. SikhaDenge should support multiple verified sender identities per workspace, a default sender, and per-template/per-automation overrides.

### Reusable automation messages

Automation emails should be reusable content assets. A message may either reference a synced template or keep an immutable versioned snapshot. SikhaDenge should support both behaviors explicitly so operators understand whether a later template edit affects future automation sends.

### Flow-native email action

Email must be a first-class action in the visual automation builder. It should not be implemented as a generic webhook workaround.

### Rich template editor

Required authoring modes:
- structured drag/drop blocks
- HTML source mode
- plain-text fallback
- subject and preheader
- personalization variables
- inline images
- CTA buttons
- attachments
- desktop/mobile preview
- test send

### Sender controls per message

A flow email should support From name, From address, Reply-To, CC and BCC, with sender verification enforced before external delivery.

### Triggered transactional and lifecycle email

The platform must support both event-triggered one-to-one messages and segmented lifecycle sequences. NEW_LEAD should be a first-class trigger.

### Staged activation

Draft -> test -> internal recipients -> limited cohort -> live must be enforced independently from content editing.

## SikhaDenge differentiators

- One contact/lead identity shared across WhatsApp and Email.
- Existing admission-stage and lead-temperature data can drive email automations.
- Human handoff, counselor ownership and CRM context can be used in sender selection and message personalization.
- Email templates and WhatsApp templates remain channel-specific assets, while automation orchestration stays channel-aware and unified.
- Safety gates and audit trails are inherited from EngageOS instead of creating a separate email-only control plane.
