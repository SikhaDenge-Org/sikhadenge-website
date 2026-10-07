# SikhaDenge WhatsApp Agent — Phases 16–20

## Phase 16 — Forms, Appointments and Payments

- Dashboard form builder and controlled submissions
- Appointment records with owners, duration, meeting URL and lifecycle status
- Payment records with INR minor-unit amounts, provider references and lifecycle status
- Audit logging and role-protected APIs
- No live payment-provider mutation without explicit provider configuration

## Phase 17 — Analytics and Retargeting

- Contacts, conversations, leads and message delivery metrics
- Lead funnel, AI lifecycle, campaigns, automation and engagement metrics
- Consent-safe retargeting counts
- Opted-out and unknown-consent suppression remains enforced by campaign preview

## Phase 18 — Integrations and Developer API

- Integration registry and configuration-status dashboard
- Connection-test foundation with secrets never returned to the browser
- Protected v1 status API using server-side API-key verification
- External integration actions remain locked unless explicitly configured

## Phase 19 — Admin and Security

- Dashboard user administration and role controls
- Session inventory and revocation
- Security posture, runtime-lock and audit visibility
- Existing authentication remains unchanged until final login consolidation

## Phase 20 — Cutover Readiness

- Readiness dashboard for Meta ownership, webhook, outbound, AI, automation, campaigns and security gates
- No automatic AiSensy disconnection
- No automatic OTP, PIN or phone-number registration
- No automatic live outbound activation
- Actual production cutover remains a separately approved operational procedure after official Meta documentation verification

## Safety invariants

- `WHATSAPP_OUTBOUND_MODE` must remain non-live during this deployment.
- `AGENT_AUTO_REPLY_ENABLED`, `AGENT_IMMEDIATE_DISPATCH_ENABLED`, `AUTOMATION_RUNTIME_ENABLED`, `AUTOMATION_ACTIONS_ENABLED`, `WHATSAPP_CAMPAIGNS_ENABLED`, `INTEGRATION_EXTERNAL_WRITES_ENABLED` and `PAYMENT_EXTERNAL_ACTIONS_ENABLED` must remain disabled.
- The existing `sikhadenge-dashboard` PM2 process must not be modified.
- The WhatsApp agent must remain isolated on port 3100.
