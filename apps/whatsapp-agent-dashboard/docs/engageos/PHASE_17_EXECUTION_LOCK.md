# EngageOS Phase 17 — Controlled Production Launch Execution Lock

Date: 2026-09-12
Repository: `maihoonankitsingh/sikhadenge-website`
Application: `apps/whatsapp-agent-dashboard`
Baseline SHA: `588a5e3914b72801756dc7a4d436be300a0555d3`
Implementation branch: `phase17-controlled-launch-20260912`

## Objective

Phase 17 provides fail-closed release tooling for progressive production activation. Repository implementation does not itself authorize or perform production deployment, provider writes, database migration, PM2/Nginx changes, secret changes, DNS changes, billing activation, or live webhook delivery.

## Locked rollout modes

1. `SHADOW`
2. `APPROVAL_ONLY`
3. `LIMITED_AUTOPILOT`
4. `FULL_AUTOPILOT_FOR_APPROVED_FLOWS`

A fresh rollout must start in `SHADOW`. Promotion may advance by only one mode at a time. Backward movement uses the dedicated rollback path rather than the promotion path.

## Locked rollout stages

1. `INTERNAL_TEST_IDENTITIES`
2. `ONE_CONNECTED_ACCOUNT`
3. `ONE_INSTAGRAM_ASSET`
4. `ONE_KEYWORD_AUTOMATION`
5. `ONE_COUNSELOR_GROUP`
6. `LIMITED_REAL_LEADS`
7. `BROADER_INSTAGRAM_COVERAGE`
8. `MESSENGER_FACEBOOK_COVERAGE`
9. `ADDITIONAL_APPROVED_CHANNELS`
10. `STABLE_FULL_ROLLOUT`

A fresh launch must start at stage 1. Scope may advance only one stage at a time. Mode and scope expansion are not allowed in the same promotion so that each production change has an observable blast radius.

## Mandatory promotion evidence

- exact SHA verified
- production build verified
- rollback tested
- monitoring active
- permissions verified
- policy verified
- selected scope approved
- controlled smoke test verified
- support runbook active
- current observation window complete before any subsequent promotion
- zero unresolved critical incidents
- zero unexplained duplicate sends
- emergency stop inactive

## Write policy

- `SHADOW`: no external writes
- `APPROVAL_ONLY`: external writes require enforced human approval
- `LIMITED_AUTOPILOT`: external writes require explicit bounded-autopilot approval
- `FULL_AUTOPILOT_FOR_APPROVED_FLOWS`: allowed only at `STABLE_FULL_ROLLOUT` with approved-flows-only enforcement

## Rollback triggers

Any of the following requires the controlled rollback path:

- emergency stop activation
- unresolved critical incident
- unexplained duplicate send
- permission violation
- policy violation
- monitoring threshold breach

Rollback policy returns to `SHADOW`, disables external writes, and contracts scope by one rollout stage where possible.

## Phase exit gate

Phase 17 may only be locked complete when all of the following are true:

- rollout reached `STABLE_FULL_ROLLOUT`
- mode reached `FULL_AUTOPILOT_FOR_APPROVED_FLOWS`
- exact production SHA/build evidence exists
- production monitoring is active
- permissions and policy are verified
- support runbook is active
- rollback has been tested
- final smoke test passed
- final observation window completed
- approved-flows-only enforcement is active
- zero unresolved critical incidents
- zero unexplained duplicate sends
- production evidence is explicitly recorded

## Production boundary

This branch is repository-side controlled-launch tooling only. It must not be represented as `LIVE`. Actual Phase 17 production rollout requires separate explicit operational approval and real production evidence at each controlled stage.
