# Phase 7 — Instagram Comments + DMs Runbook

## Verified platform contract

The Phase 7 implementation targets Instagram professional accounts through the official Instagram API. Comment webhook events are normalized from the `comments` / `live_comments` subscription shapes. Public replies use the comment replies edge. Initial private replies use the Instagram messages endpoint with the comment ID as recipient context.

Private comment replies are capped by the repository policy at seven days for normal comments. `live_comments` private replies are not automatically enabled because the runtime cannot safely prove the Live broadcast is still active. Follow-up DM handling continues through the existing Instagram messaging webhook path and its 24-hour service window.

## Repository safety defaults

- `INSTAGRAM_COMMENT_AUTOMATION_ENABLED=false`
- `INSTAGRAM_COMMENT_ACTION_MODE=disabled`
- `INSTAGRAM_COMMENT_ACTION_KILL_SWITCH=on`
- `AUTOMATION_ACTIONS_ENABLED=false`
- `INTEGRATION_EXTERNAL_WRITES_ENABLED=false`
- `INSTAGRAM_OUTBOUND_MODE=disabled`

No repository commit activates these values in production.

## Permission evidence

Use Integrations -> Instagram comment management -> Verify comments permission. The probe performs GET-only media and comment-edge calls. It never sends a comment or message. A healthy Instagram connection still requires identity/API evidence and signed webhook evidence in addition to permission evidence.

## Rule configuration

`INSTAGRAM_COMMENT_RULES_JSON` accepts up to 50 rules. A rule may target media IDs, keywords, or `matchAll=true`, and may define public/private reply text plus sensitive keywords. Multiple matching rules fail to human review rather than choosing silently.

## Execution behavior

1. Signature and replay protection run before comment logic.
2. Comment ID is reserved as an idempotent `WebhookEvent`.
3. Rule matching is deterministic.
4. Active suppression and sensitive/complaint keywords block automatic action or force human review.
5. Integration must be `CONNECTED` before reply actions are considered supported.
6. `disabled` and `dry_run` never send external writes.
7. Live public/private actions use independent idempotency reservations.
8. An unresolved `PENDING_EXTERNAL_WRITE` is never resent automatically; it is escalated for human review.
9. Retryable provider errors are marked retryable and cause webhook retry; permanent failures are recorded and not spam-retried.
10. Successful private replies persist recipient/message IDs in the action event for later DM/funnel attribution.

## Controlled live exit gate

Before enabling live comment actions, capture:
- identity API verification
- comment permission read-probe verification
- signed comments webhook evidence
- dry-run evidence on selected test media
- one public reply test
- one private reply test within the allowed window
- duplicate webhook replay test proving no duplicate reply
- sensitive/complaint handoff test
- suppression test
- DM continuation test after recipient responds
- kill-switch test
- rollback to disabled mode

Production enablement is a separate controlled action and is not performed by this PR.
