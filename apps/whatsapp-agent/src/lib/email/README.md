# Email module

This module is under guarded construction on `phase/email-automation-foundation-20260914`.

Implemented in Phase E0:
- provider-neutral email types
- runtime safety policy
- deterministic sender resolution
- advanced template contracts
- lead-trigger eligibility/idempotency contract
- Gmail provider registration in the existing Integrations registry
- automation builder UI exposure for email triggers/actions

Not yet live:
- OAuth callback/token persistence
- Prisma email entities/migration
- Gmail API adapter
- template CRUD API/UI
- media storage UI
- external email sends
- inbound email synchronization
- delivery events
- production automation execution

External email delivery must remain disabled until the database, OAuth, sender verification and dry-run tests are complete.
