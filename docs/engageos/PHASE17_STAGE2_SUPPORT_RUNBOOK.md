# Phase17 Stage2 Support Runbook

Status: DRAFT — operator review/activation required. This document does not itself satisfy `PHASE17_SUPPORT_RUNBOOK_ACTIVE`.

Prepared against release checkpoint `e71d1ee579c6f72020639230a341e4e008ae9af6`. Always resolve the current release/live SHA before acting; never assume this checkpoint remains current.

## Purpose

This runbook is the operational support path for SikhaDenge WhatsApp Agent / EngageOS Phase17 controlled launch. It is intentionally fail-closed. It preserves the current working production system, Stage1 safety posture, evidence lineage, and rollback capability. It does not authorize Stage2 promotion, external provider writes, or a rollback rehearsal.

## Locked safety posture

Expected Stage1 baseline before Stage2 governance is complete:

- stage: `INTERNAL_TEST_IDENTITIES`
- mode: `SHADOW`
- write policy: `NO_EXTERNAL_WRITES`
- external writes allowed: `false`
- controlled-launch version: `1`
- controlled-launch transition count: `1`

Any mismatch is a hard stop. Do not repair state by guessing or by manually editing the production database.

Stage2 promotion requires separate explicit operator authorization and complete governance evidence. A rollback rehearsal also requires separate explicit authorization because it may be production-impacting.

## Canonical locations

- Repository: `SikhaDenge-Org/sikhadenge-website`
- Release branch: `release/whatsapp-instagram-agent-flow-20260731`
- Application: `apps/whatsapp-agent-dashboard`
- Production app source: `/var/www/sikhadenge-whatsapp-agent/source/apps/whatsapp-agent-dashboard`
- PM2 process: `sikhadenge-whatsapp-agent`
- Production URL: `https://whatsapp.sikhadenge.in`
- Production port: `3100`

Repository ownership may move again. Treat GitHub repository identity/history as canonical and resolve redirects before changing anything.

## First-response checklist

For any incident, regression, suspected drift, or support escalation:

1. Freeze the current GitHub release SHA from the release branch.
2. Read the production live SHA from the production source checkout.
3. Confirm release SHA equals live SHA. If not, stop and classify as release/live drift before any other change.
4. Confirm tracked production worktree is clean. If dirty, preserve diagnostics and use the guarded production workflow's reviewed recovery path; do not overwrite local production changes blindly.
5. Confirm PM2 process `sikhadenge-whatsapp-agent` is `online`.
6. Confirm `https://whatsapp.sikhadenge.in/login` returns HTTP 200.
7. Confirm the Stage1 baseline and transition count remain exactly as locked above.
8. Confirm active kill-switch count and enabled high-risk feature-flag count are understood before any rollout decision.
9. Review the most recent successful Production Batch and exact-SHA machine-evidence run for the same release SHA.
10. Do not send external WhatsApp/Instagram/Messenger writes as part of diagnosis unless a separately authorized procedure explicitly permits them.

## Incident severity and response

### P0 — safety or uncontrolled-write risk

Examples: external writes unexpectedly enabled, controlled-launch state differs from locked baseline without an approved transition, release/live SHA mismatch combined with unknown production behavior, or evidence of unintended provider sends.

Action:

- Stop rollout activity immediately.
- Do not promote Stage2.
- Preserve current SHA, PM2 status, route health, relevant logs, and controlled-launch state.
- Use existing kill-switch and fail-closed controls as designed; do not invent database changes.
- Escalate for explicit production-impacting authorization before rollback or state mutation.

### P1 — production application regression

Examples: login failure, authenticated dashboard route regression, PM2 instability, production verification failure, or route HTTP-contract regression.

Action:

- Freeze release/live SHA and verify worktree cleanliness.
- Inspect the guarded Production Batch logs and protected evidence.
- Determine whether automatic rollback already occurred.
- If rollback already restored the previous healthy state, preserve it and diagnose the failed candidate read-only.
- Do not redeploy the same failed candidate without a demonstrated root-cause fix and a fresh guarded release cycle.

### P2 — operational/evidence gap

Examples: governance evidence missing, monitoring proof absent, support proof incomplete, or observation window incomplete while production itself is healthy.

Action:

- Keep Stage1 unchanged.
- Gather read-only proof where possible.
- Obtain genuine operator attestation for human gates.
- Never substitute machine evidence for human/operator evidence.

## Production verification contract

The guarded production path is `.github/workflows/whatsapp-agent-production-batch1.yml` plus the `engageos-production-*` scripts in the application.

Before considering a deployment healthy, verify at minimum:

- exact target/release SHA
- clean tracked worktree or the workflow's reviewed recovery handling
- backup creation/verification where the guarded batch performs it
- successful build and migration checks
- PM2 process online
- login HTTP 200
- expected unauthenticated redirect contracts on protected application routes
- Stage1 safety invariants
- external/provider write controls remain fail-closed

Do not bypass the guarded Production Batch with an ad-hoc server update.

## Release/live drift procedure

If GitHub release SHA and production live SHA differ:

1. Do not record exact-SHA governance evidence.
2. Determine whether a Production Batch is queued, running, succeeded, failed, or automatically rolled back.
3. Inspect commit ancestry before treating a newer SHA as authoritative; newer alone does not mean correct.
4. Let an already-authorized canonical deployment reconcile the system when safe; avoid duplicate deploy dispatches.
5. Re-run machine evidence only after release/live alignment is restored and the exact matching Production Batch is successful.

## PM2 or route-health failure

If PM2 is not online or login is not HTTP 200:

- Treat production as unhealthy.
- Capture process status and relevant error signatures without exposing secrets or message payloads.
- Check whether a recent guarded deployment failed and restored a previous release.
- Do not mark authenticated smoke, monitoring, production evidence, or governance readiness as proven while basic health is failing.

## Controlled-launch state drift

If expected Stage1 state/version/transition count differs:

- Stop Stage2 work.
- Do not manually normalize the database.
- Inspect controlled-launch transitions and the exact release history read-only.
- Require explicit authorization for any state mutation.

## Duplicate-send or incident review

Use read-only database/provider evidence. Relevant signals include failed outbound messages, stale queued outbound messages, webhook processing errors, duplicate provider message IDs, duplicate webhook event keys, and exact duplicate outbound groups.

A clear technical signal screen is supporting evidence only. The operator governance gate still requires a genuine exact-SHA human attestation and a real proof reference.

## Authenticated production smoke

The governance gate `PHASE17_AUTHENTICATED_SMOKE` requires a real production authenticated session. CI browser tests against a local seeded database do not satisfy it.

The operator should:

1. Log in to the real production dashboard using their authorized account.
2. Verify the main authenticated surfaces needed for controlled launch, including `/inbox` and other critical pages selected for the check.
3. Keep the session read-only.
4. Do not press send, launch campaigns, trigger automations, or perform any external provider write.
5. Record the exact release SHA, time, pages checked, outcome, and an immutable/verifiable proof reference.

Evidence metadata must state `result=PASS`, `authenticated=true`, `readOnly=true`, and `externalWritesAttempted=false` only if that is factually what occurred.

## Monitoring gate

Current point-in-time PM2/login/governance checks prove health at the time of a run; they do not by themselves prove continuous monitoring is active.

Before recording `PHASE17_MONITORING_ACTIVE`, there must be a real operational monitoring mechanism with an identifiable proof reference and an operator confirmation that its status is ACTIVE. Do not infer this gate from a one-time health check.

## Observation window

`PHASE17_OBSERVATION_WINDOW_COMPLETE` requires a real completed interval. Record the actual `windowStartedAt` and `windowEndedAt` timestamps only after the interval has elapsed and the end is not before the start.

During the window, keep the locked Stage1 posture unless separately authorized, review production health and incident/duplicate-send signals, and preserve exact-SHA context. Do not fabricate or backdate the interval.

## Rollback boundary

The production system has guarded backup/recovery and rollback behavior in the Production Batch path. Existing rollback capability is not the same as completing the governance gate `PHASE17_ROLLBACK_REHEARSAL`.

Do not execute a deliberate rollback rehearsal from this runbook without separate explicit authorization. Before an authorized rehearsal, define:

- exact current release SHA
- exact rollback target
- bounded user impact
- backup/recovery artifacts
- success criteria
- recovery-to-current procedure
- evidence capture plan

A rehearsal gate may be recorded as `result=PASS` only after the real rehearsal succeeds and a human operator attests to the proof.

## Stage2 scope approval boundary

Candidate currently expected by governance tooling: `cmtv8n9v50001kw3hzm6b2y0b`.

Do not record `PHASE17_STAGE2_SCOPE_APPROVED` until the operator explicitly approves that exact candidate for Stage2. Approval of a runbook, monitoring, smoke test, or observation window is not scope approval.

Even an approved Stage2 scope does not itself authorize Stage2 promotion. Promotion requires its own separate explicit authorization after all governance gates are proven.

## Evidence integrity

Operator evidence must be exact-SHA-bound and use:

- entity type `CONTROLLED_LAUNCH_GOVERNANCE`
- exact live SHA as entity ID
- reason code `OPERATOR_VERIFIED_EXACT_SHA`
- real active operator actor ID
- unique request ID
- non-empty proof reference
- valid verification timestamp
- exact gate-specific metadata

Machine evidence must remain machine-attributed and cannot satisfy operator gates.

If the release SHA changes, previously recorded exact-SHA evidence may become stale for the new release. Re-evaluate the relevant machine and operator evidence instead of copying records forward.

## Runbook activation rule

This document remains DRAFT until a real operator reviews it and explicitly confirms it is the active support/incident-response runbook for the exact current release context. Only after that genuine review/activation may `PHASE17_SUPPORT_RUNBOOK_ACTIVE` be recorded with `runbookStatus=ACTIVE` and a real proof reference.

Activating this runbook does not authorize rollback, Stage2 scope approval, Stage2 promotion, or external writes.
