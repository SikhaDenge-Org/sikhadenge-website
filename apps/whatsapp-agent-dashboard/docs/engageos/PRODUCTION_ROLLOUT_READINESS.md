# EngageOS production rollout readiness

Updated: 2026-09-10

This document is the operational gate between **repository implemented**, **production evidence approved**, and **live activation**.

## Current repository state

- Pull request: `#158` — EngageOS Phases 3–17
- Base branch: `release/whatsapp-instagram-agent-flow-20260731`
- Final release-candidate head: `a7afc164344e6deb3ab20a1a7503561230c1a0f2`
- CI evidence: WhatsApp Agent CI run `#801` passed behavioral tests, strict TypeScript, production build, migration regression and authenticated Inbox browser regression.
- Previous safety-gate CI: run `#800` passed on `514f3011624e6e8a42bceb9c2b3342a86a15c24a`.
- PR review evidence: no submitted reviews and no inline review threads were present at the final pre-merge check.
- The guarded production batch includes a high-risk flag gate that checks the live env file, invoking shell environment and retained PM2 process environment before backup/migration/activation.

A green CI run does **not** mean the implementation is deployed or live.

## Non-negotiable release gates

Do not merge, deploy, enable provider writes, enable billing, or call a phase live unless the applicable evidence below is captured.

### Gate A — repository integrity

- [x] Phase 3–17 implementation exists on the feature branch.
- [x] Fail-closed defaults remain in place for new runtimes and provider writes.
- [x] CI for the final exact release candidate SHA is green (`#801`).
- [x] No unresolved PR review threads were present at the final pre-merge check.
- [x] Exact release candidate head is recorded: `a7afc164344e6deb3ab20a1a7503561230c1a0f2`.

### Gate B — production transport and rollback

- [ ] Production GitHub environment/secrets are available to the guarded workflow.
- [ ] Pinned SSH transport passes.
- [ ] Live repository working tree is clean.
- [ ] Existing live SHA is recorded.
- [ ] Database backup completes and checksum verifies.
- [ ] Previous `.next` build/source rollback artifacts are preserved.
- [ ] Automatic rollback path is verified before activation.

The canonical guarded workflow is `.github/workflows/whatsapp-agent-production-batch1.yml` and the server-side orchestrator is `scripts/engageos-production-batch1.sh`.

### Gate C — data and migration safety

- [ ] Prisma migration status is inspected against the production database.
- [ ] Any pending migration is additive/backward-compatible.
- [ ] Database backup exists before migration.
- [ ] Migration evidence is captured.
- [ ] No destructive production backfill or bulk rewrite is performed without a separately reviewed plan.
- [ ] Unified Inbox/WhatsApp migration stays on legacy or shadow mode until parity evidence is accepted.

### Gate D — Meta connection evidence

For every channel promoted beyond repository-only status:

- [ ] API identity verification is successful for the real production account.
- [ ] Required permissions/scopes are verified from provider evidence.
- [ ] Required signed webhook evidence is recorded.
- [ ] Token expiry/revocation state is healthy.
- [ ] Connection health is evidence-derived; secrets alone never produce `CONNECTED`.

Channel-specific requirements:

- WhatsApp: correct production phone-number ID and signed inbound webhook evidence.
- Instagram: correct professional account linkage and required Graph API permissions.
- Messenger/Facebook: correct Page isolation, Page/Messenger capability evidence and required permissions.

### Gate E — outbound-write safety

- [ ] WhatsApp/Instagram/Messenger provider writes remain disabled during initial deploy.
- [ ] Connector controlled-write approval remains disabled during initial deploy.
- [ ] AI grounded-send enforcement is not enabled until approved-source and confidence evidence is verified.
- [ ] Idempotency/duplicate-send monitoring is active before any write rollout.
- [ ] First provider-write activation uses a controlled test account/conversation.
- [ ] Zero unexplained duplicate sends are observed before promotion.

### Gate F — production smoke verification

After application activation, but before enabling new write capabilities:

- [ ] `https://whatsapp.sikhadenge.in` responds successfully.
- [ ] Authentication works.
- [ ] Existing Inbox loads without regression.
- [ ] Existing legacy WhatsApp read/write path remains healthy.
- [ ] `/api/engageos/readiness` reports repository state separately from production/live evidence.
- [ ] Integration health endpoint/UI does not falsely report `CONNECTED`.
- [ ] New v1 Inbox APIs are read-only/additive unless explicitly promoted.
- [ ] PM2 process is healthy after restart/activation.
- [ ] Post-deploy evidence artifact is captured.

### Gate G — staged rollout

Promotion order is locked:

1. `repository implemented`
2. production deploy with all new high-risk flags OFF
3. read-only production evidence collection
4. shadow/parity mode
5. controlled single-channel/single-capability activation
6. monitored limited rollout
7. broader rollout only after explicit evidence review

No stage may be skipped.

## Initial production flag policy

The first production deployment of the EngageOS branch must preserve fail-closed behavior. In particular, new event workers, normalized-read cutovers, grounded AI enforcement, provider outbound writes, connector writes and any billing/enterprise activation must not be enabled merely because the code has been deployed.

Deployment and activation are separate operations.

## Canonical production workflow

The production batch performs:

1. read-only preflight
2. high-risk production flag gate across `.env`, invoking shell env and retained PM2 env
3. verified database backup
4. guarded migration
5. isolated build and atomic application activation
6. post-deploy verification
7. rollback-readiness evidence capture

On an activation failure, the batch is designed to invoke automatic application rollback when deployment state exists.

## Stop conditions

Stop rollout and do not promote if any of the following is true:

- exact SHA cannot be proven
- final candidate CI is not green
- production backup/checksum fails
- migration safety is uncertain
- signed webhook or provider permissions are missing for a capability being activated
- PM2/live smoke verification fails
- existing Inbox/WhatsApp behavior regresses
- unexplained duplicate sends occur
- rollback artifacts are missing
- any critical incident remains unresolved

## Current verdict

**Repository implementation:** complete for Phases 3–17.

**Repository release candidate:** CI-approved at head `a7afc164344e6deb3ab20a1a7503561230c1a0f2` via CI `#801`.

**Production deployment of the EngageOS branch:** pending guarded production workflow evidence.

**Live activation of new EngageOS capabilities:** not approved; provider evidence and staged rollout gates remain mandatory.
