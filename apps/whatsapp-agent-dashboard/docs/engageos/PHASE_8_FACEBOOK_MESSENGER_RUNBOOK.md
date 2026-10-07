# Phase 8 — Facebook Page Comments + Messenger Runbook

## Repository scope

Phase 8 extends the existing Messenger DM implementation with Page-comment normalization, deterministic targeting rules, guarded public-comment reply execution, Page capability verification and stricter Messenger response-window policy. Existing Messenger inbound message, delivery, read and echo persistence remains the compatibility runtime.

## Safety defaults

- `FACEBOOK_PAGE_COMMENT_AUTOMATION_ENABLED=false`
- `FACEBOOK_PAGE_COMMENT_ACTION_MODE=disabled`
- `FACEBOOK_PAGE_COMMENT_ACTION_KILL_SWITCH=on`
- `FACEBOOK_PAGE_COMMENT_WRITE_APPROVED=false`
- `MESSENGER_OUTBOUND_MODE=disabled`
- `ENGAGEOS_MESSENGER_POLICY_ENFORCED=false`
- `AUTOMATION_ACTIONS_ENABLED=false`
- `INTEGRATION_EXTERNAL_WRITES_ENABLED=false`

No repository commit activates production writes.

## Read-only capability evidence

Integrations -> Facebook Page + Messenger capability performs GET-only Page identity, conversations, published-post and comment-edge probes. It never sends a Page comment or Messenger message. Successful evidence is persisted as Messenger permission evidence; a connection still requires API identity and signed webhook evidence before `CONNECTED`.

Read probes do not prove a future provider write will succeed. The first controlled write remains a separate production exit test.

## Messenger requirements

When `ENGAGEOS_MESSENGER_POLICY_ENFORCED=true`, outbound text additionally requires:

1. configured Page ID equals the conversation Page ID,
2. persisted Messenger integration status is `CONNECTED`,
3. Messenger outbound is live and the kill switch is off,
4. a recent inbound customer message exists inside the standard 24-hour response window.

The flag defaults false so this PR does not change current production behavior before controlled activation.

## Page comment runtime

1. Signature and replay protection run before comment logic.
2. Signed webhook evidence is recorded for each Page entry ID.
3. Each comment is reserved by Page ID + comment ID.
4. Only `ADD` events are eligible; Page self-comments are ignored.
5. Rule matching is deterministic. Multiple matches route to human review.
6. Sensitive/complaint keywords route to human review.
7. Active suppression blocks automatic action.
8. Disabled mode records no external write; dry-run records only a plan.
9. Live mode requires the Page integration to be `CONNECTED`.
10. Live writes additionally require `FACEBOOK_PAGE_COMMENT_WRITE_APPROVED=true`, global integration writes and automation actions.
11. Public replies use independent idempotency reservations.
12. `PENDING_EXTERNAL_WRITE` is never automatically resent because provider outcome is unknown; it routes to human review.
13. Retryable provider errors keep the comment retriable; permanent failures are recorded and routed to human review.

## Exit evidence

- signed Page webhook evidence
- GET-only Page/Messenger capability verification
- Page-comment normalization fixtures
- selected post/rule dry run
- one controlled Page public reply
- duplicate webhook replay proving no duplicate reply
- sensitive/complaint handoff
- suppression test
- Messenger inbound/outbound text regression
- delivery/read/echo regression
- 24-hour response-window rejection
- Page isolation test using distinct Page IDs
- comment kill-switch test
- Messenger outbound kill-switch test
- rollback to disabled action mode and policy enforcement false

Production activation is separate from branch implementation and CI completion.
