# Phase22F causal scheduler outbound dispatch

This phase hardens the WhatsApp automation scheduler before any broader production outbound activation.

## Risk closed

Previously, event processing could be scoped by `WHATSAPP_AUTOMATION_EVENT_SOURCE_PREFIX`, but the final outbound step called the generic queued-message batch dispatcher without a causal filter. If outbound were later enabled, unrelated `QUEUED` WhatsApp messages could be inspected by that scheduler cycle.

## New contract

- Each automation event execution returns the exact `queuedMessageIds` produced by its automation runs.
- A targeted event cohort dispatches only those exact message IDs.
- An explicit empty message-ID list means zero inspected / zero sent; it never falls back to the global queue.
- Non-targeted global queue dispatch is rejected unless `WHATSAPP_AUTOMATION_ALLOW_GLOBAL_QUEUED_DISPATCH=true`.
- Repository and PM2 defaults keep that global acknowledgement false.
- Existing provider live-mode, controlled-launch, approval, kill-switch and scheduler outbound gates remain independent.

This change does not enable production outbound by itself.
