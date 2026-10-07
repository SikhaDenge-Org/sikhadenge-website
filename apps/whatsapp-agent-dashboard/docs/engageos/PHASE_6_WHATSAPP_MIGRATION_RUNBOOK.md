# Phase 6 — WhatsApp Migration Runbook

## Safety model

Phase 6 keeps the existing `WhatsAppContact`, `WhatsAppConversation`, and `WhatsAppMessage` tables as the compatibility persistence layer. Normalized conversation IDs intentionally equal legacy conversation IDs. Customer/identity mapping is deterministic and planned from existing data; the repository script in this phase is read-only and does not mutate production data.

Production is not activated by this document or its repository changes.

## Core modes

- `legacy` — compatibility path; default and rollback mode.
- `shadow` — validates normalized event projection while preserving compatibility writes.
- `normalized` — requires durable event runtime, standalone worker, explicitly approved/completed identity backfill, and configured WhatsApp phone-number ID. The adapter remains compatible with existing persistence while all entry points route through the Phase 6 contract.

## Required order

1. Keep `ENGAGEOS_WHATSAPP_CORE_MODE=legacy`.
2. Run `npm run whatsapp:migration:backfill`. This is read-only and prints the deterministic mapping plan.
3. Review and approve a separate production backfill procedure before any metadata writes occur.
4. After an approved backfill is executed, run `npm run whatsapp:migration:parity`. Do not continue unless it exits successfully.
5. Set `ENGAGEOS_WHATSAPP_BACKFILL_COMPLETE=true` only after parity evidence is captured.
6. Move to `ENGAGEOS_WHATSAPP_CORE_MODE=shadow` and verify inbound/outbound regression evidence.
7. Verify Redis, `ENGAGEOS_EVENT_RUNTIME_ENABLED=true`, and `ENGAGEOS_EVENT_WORKER_ENABLED=true` in the controlled environment.
8. Move one controlled account to `normalized` only after approval.
9. Repeat inbound text/media, outbound text/media/template, delivery, read, failure, service-window, duplicate-event, and duplicate-send tests.

## Rollback

Set `ENGAGEOS_WHATSAPP_CORE_MODE=legacy`. If durable ingress is involved, also set `ENGAGEOS_EVENT_RUNTIME_ENABLED=false` and stop the standalone event worker. Existing contact/conversation/message IDs remain unchanged, so rollback requires no data reverse-migration.

Do not delete any previously approved mapping metadata during incident rollback. It is inert in legacy mode and preserves forensic evidence.

## Exit evidence

- read-only backfill mapping plan
- separately approved production backfill evidence
- parity report with zero missing mappings, orphan conversations, or duplicate customer refs
- CI: TypeScript, production build, migration regression, authenticated Inbox regression
- controlled inbound/outbound/status tests
- rollback rehearsal evidence
