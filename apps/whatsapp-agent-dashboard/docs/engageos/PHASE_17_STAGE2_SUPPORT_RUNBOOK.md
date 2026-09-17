# Phase 17 — Stage 2 Support Runbook

## Purpose

This runbook defines the operational support procedure for EngageOS Phase 17 Stage 2 readiness. It does not promote Stage 2, enable external writes, dispatch workflows, approve scope, or record governance evidence by itself.

The default safe state remains:

- rollout stage: `INTERNAL_TEST_IDENTITIES`
- rollout mode: `SHADOW`
- external writes: `false`
- emergency stop: available and preferred over risky recovery
- production release: exact-SHA controlled

## Non-negotiable safety rules

1. Never promote Stage 2 from this runbook.
2. Never enable external writes as part of incident recovery or smoke testing.
3. Never fabricate or backfill operator evidence.
4. Evidence is valid only for the exact verified live SHA.
5. Stop on canonical-source tracked drift, PM2 runtime tracked drift, build-ID mismatch, missing/invalid deploy-state provenance, or deploy-state/runtime-path mismatch.
6. Stop if the PM2 process is not `online` or `/login` does not return HTTP 200.
7. Treat duplicate-send or critical-incident uncertainty as fail-closed.
8. Use the production rollback script only with an approved, verified rollback target and backup state.
9. Do not delete forensic logs, backup artifacts, or prior evidence during incident response.
10. Any evidence write, Stage 2 approval, workflow dispatch, release mutation, deploy, merge, or production switch requires separate authorization.

## Canonical production identity

- app: `apps/whatsapp-agent-dashboard`
- PM2 process: `sikhadenge-whatsapp-agent`
- public URL: `https://whatsapp.sikhadenge.in`
- release branch: `release/whatsapp-instagram-agent-flow-20260731`
- canonical source: `/var/www/sikhadenge-whatsapp-agent/source`

Do not hard-code an old release SHA into an operational decision. Resolve and compare the remote release SHA and canonical source SHA immediately before each controlled action.

The PM2 runtime may be either the canonical source app itself or a separate build mirror under `/var/www/sikhadenge-whatsapp-agent/`. The production deploy path intentionally supports a separate runtime mirror whose Git checkout can remain on an older repository SHA while the exact current release `.next` build is atomically copied into that runtime. Therefore, runtime identity is not defined by PM2 runtime Git SHA alone.

Verified deploy-state provenance is mandatory for both runtime modes. The deploy-state file must belong to the verified production deployment that activated the exact expected release SHA, remain under `/root/sikhadenge-backups/engageos-*/deploy-state.txt`, and bind `RELEASE_SHA`, `NEW_BUILD_ID`, and `RUNTIME_APP` to the observed production state.

For a canonical-source runtime, PASS requires all of the following:

- canonical source/runtime Git SHA equals the exact expected release SHA
- canonical source/runtime tracked worktree is clean
- source/runtime `.next/BUILD_ID` exists and matches verified deploy-state `NEW_BUILD_ID`
- verified deploy-state `RELEASE_SHA` equals the exact expected release SHA
- verified deploy-state `RUNTIME_APP` resolves to the PM2 `pm_cwd`
- PM2 is `online`
- `/login` returns HTTP 200

For a separate build mirror, PASS requires all of the following:

- canonical source SHA equals the exact expected release SHA
- canonical source tracked worktree is clean
- PM2 runtime tracked worktree is clean
- canonical source `.next/BUILD_ID` exists
- PM2 runtime `.next/BUILD_ID` exists and exactly equals the canonical source build ID
- verified deploy-state `RELEASE_SHA` equals the exact expected release SHA
- verified deploy-state `NEW_BUILD_ID` equals both source and runtime build IDs
- verified deploy-state `RUNTIME_APP` resolves to the same path as PM2 `pm_cwd`
- PM2 is `online`
- `/login` returns HTTP 200

A separate mirror's old Git SHA is diagnostic metadata, not sufficient proof that the executed build is stale. Conversely, matching build IDs without exact deploy-state release provenance is also insufficient. All checks remain fail-closed.

## Operator roles

### Primary operator

Owns health checks, read-only diagnostics, evidence collection, incident classification, and coordination.

### Release operator

Owns approved release reconciliation, rollback execution, deployment recovery, and exact-SHA verification.

### Product/business approver

Owns Stage 2 scope approval. Technical readiness must not be treated as business approval.

### Security/governance approver

Owns evidence integrity, external-write policy, emergency-stop decisions, and escalation for critical incidents or unexplained duplicates.

## Start-of-shift health check

Run these checks before any Phase 17 operational action:

```bash
EXPECTED_RELEASE_SHA="$(git -C /var/www/sikhadenge-whatsapp-agent/source ls-remote origin refs/heads/release/whatsapp-instagram-agent-flow-20260731 | awk '{print $1}')"
SOURCE_SHA="$(git -C /var/www/sikhadenge-whatsapp-agent/source rev-parse HEAD)"
SOURCE_DIRTY="$(git -C /var/www/sikhadenge-whatsapp-agent/source status --porcelain --untracked-files=no)"
pm2 describe sikhadenge-whatsapp-agent
curl -fsS -o /dev/null -w '%{http_code}\n' https://whatsapp.sikhadenge.in/login
```

PASS requires:

- remote release SHA is non-empty
- canonical source SHA equals remote release SHA
- canonical source has zero tracked changes
- PM2 process is `online`
- `/login` returns HTTP 200

Then resolve the PM2 runtime `pm_cwd` and run the canonical read-only identity verifier. Always supply the verified deploy-state file from the production deployment that activated the exact current source SHA:

```bash
EXPECTED_RELEASE_SHA="$EXPECTED_RELEASE_SHA" \
  LIVE_APP=/var/www/sikhadenge-whatsapp-agent/source/apps/whatsapp-agent-dashboard \
  DEPLOY_STATE_FILE=/root/sikhadenge-backups/engageos-<verified-production-run>/deploy-state.txt \
  PM2_PROCESS_NAME=sikhadenge-whatsapp-agent \
  CHECK_HTTP_URL=https://whatsapp.sikhadenge.in \
  bash scripts/engageos-phase17-runtime-identity-readonly.sh
```

Do not infer the deploy-state path from recency alone. Bind it to the verified production run for the exact current source SHA. The verifier requires deploy-state provenance in both runtime modes. If the runtime is the canonical source app itself, it additionally enforces direct runtime Git SHA equality. If it is a separate build mirror, it permits a different mirror Git SHA only when clean-state, exact build-ID equality, deploy-state release/build/runtime-path provenance, PM2 health, and login health all pass.

## Phase 17 production readiness

From the live app directory, use the existing readiness script with the exact verified release SHA:

```bash
EXPECTED_RELEASE_SHA="$EXPECTED_RELEASE_SHA" \
  ENV_FILE=.env \
  PM2_PROCESS_NAME=sikhadenge-whatsapp-agent \
  CHECK_HTTP_URL=https://whatsapp.sikhadenge.in \
  bash scripts/engageos-phase17-production-readiness.sh
```

Do not continue on any readiness failure. Warnings must be reviewed and attached to the incident/support record.

## Monitoring checklist

During the controlled observation period, monitor at minimum:

- PM2 process state and restart count
- HTTP availability of `/login`
- tracked canonical-source drift
- tracked PM2 runtime drift
- source/runtime build-ID equality
- exact deploy-state release/build/runtime-path provenance
- outbound send failures
- duplicate message groups / idempotency anomalies
- failed or denied security audit events
- webhook/event-runtime dead-letter or retry anomalies
- unexpected feature-flag or controlled-launch changes
- database migration health

Monitoring evidence must identify the exact live SHA and the observation timestamp.

## Critical incident triage

Treat the following as critical until disproven:

- uncontrolled or unexpected external message send
- unexplained duplicate send
- cross-workspace data exposure
- authentication or authorization bypass
- unexpected Stage 2 promotion or feature-flag activation
- loss of exact-SHA control
- corrupted migration/runtime state
- inability to stop outbound execution

### Immediate response

1. Preserve the current SHA, PM2 state, logs, request IDs, correlation IDs, and relevant audit records.
2. Keep or restore external writes to OFF.
3. Activate the emergency stop where supported if any outbound risk exists.
4. Stop further promotion, deployment, evidence recording, or workflow dispatch.
5. Classify the incident and identify the first unsafe event timestamp.
6. Escalate to release and security/governance operators.
7. Decide whether rollback is required.

Do not delete evidence or attempt broad cleanup before forensic capture.

## Duplicate-send investigation

For a suspected duplicate:

1. Compare message IDs, provider IDs, idempotency keys, conversation IDs, timestamps, and request/correlation IDs.
2. Check whether the duplicate was reserved once or multiple times in the durable event runtime.
3. Check webhook replay handling and retry/dead-letter history.
4. Confirm whether the duplicate crossed workspace or contact boundaries.
5. Classify the duplicate as explained/replay-safe or unexplained.

An unexplained duplicate blocks Stage 2 readiness. Do not record `unexplainedDuplicateSends=0` unless the reviewed window genuinely supports zero.

## Emergency stop

Use the narrowest control that reliably prevents external execution. Prefer disabling outbound/external-write policy or the relevant runtime feature flag over destructive recovery.

After activating the emergency stop:

- verify no new outbound execution occurs
- keep the system in SHADOW/internal-test state
- preserve logs and queue/dead-letter state
- do not re-enable writes until the incident is resolved and separately approved

## Rollback procedure

The canonical application rollback script is:

```bash
bash scripts/engageos-production-rollback.sh
```

Never run it without:

- an explicitly approved rollback action
- a verified backup/deploy-state file
- a known-good rollback SHA/build
- exact current production SHA and clean tracked worktrees
- confirmation of the intended PM2 process and runtime path

A valid rehearsal/rollback must verify:

- source restored to the intended target SHA
- expected build restored
- target PM2 process online after restart
- `/login` returns HTTP 200
- failed build preserved for forensics
- production schema rollback is not attempted unless separately designed and approved

## Authenticated read-only smoke

The governance gate requires all of the following:

- `result=PASS`
- `authenticated=true`
- `readOnly=true`
- `externalWritesAttempted=false`

### Allowed smoke actions

After a genuine authenticated dashboard session is established, use only read/navigation operations against approved pages such as:

- `/inbox`
- `/contacts`
- `/analytics`
- `/leads`
- `/settings`

Verify authenticated pages render successfully and do not redirect to `/login`.

### Forbidden smoke actions

Do not:

- send WhatsApp, Instagram, Facebook, email, SMS, or voice traffic
- modify contacts, leads, stages, tags, templates, campaigns, automations, settings, users, sessions, integrations, or API keys
- publish automations
- trigger webhooks
- enable feature flags
- approve Stage 2 scope
- exercise provider write APIs

A normal production login creates session/audit state. Treat that authentication-side state as expected authentication activity, not as an external-write action. The navigation portion of the smoke must remain read-only.

## Support escalation matrix

| Severity | Example | Immediate action | Escalation |
| --- | --- | --- | --- |
| SEV-0 | uncontrolled outbound, cross-workspace exposure, auth bypass | emergency stop, external writes OFF, preserve evidence | release + security/governance + product owner immediately |
| SEV-1 | unexplained duplicate, persistent send failure, exact-SHA loss | stop promotion, preserve logs, investigate/rollback decision | release + security/governance |
| SEV-2 | UI/read-only degradation with no write risk | keep SHADOW, diagnose, avoid risky deploy | primary + release operator |
| SEV-3 | cosmetic/non-blocking issue | document and schedule fix | normal engineering queue |

## Evidence capture

For every operational proof, preserve:

- exact canonical live/source SHA
- remote release SHA used for the controlled action
- source tracked-clean result
- PM2 runtime path and tracked-clean result
- source and runtime build IDs
- verified deploy-state file path, `RELEASE_SHA`, `NEW_BUILD_ID`, and `RUNTIME_APP`
- verified timestamp in UTC
- operator/actor identity
- request/correlation ID when applicable
- proof reference/path
- relevant metadata required by the governance validator
- PM2 and login health result

Operator evidence must be recorded only through the canonical Phase 17 recorder and only after the required attestation is supplied for the current action.

## Governance gate mapping

The support process must never infer a gate from unrelated evidence.

- critical incident review: `unresolvedCriticalIncidents=0`
- duplicate-send review: `unexplainedDuplicateSends=0`
- rollback rehearsal: `result=PASS`
- monitoring active: `monitoringStatus=ACTIVE`
- authenticated smoke: `result=PASS`, `authenticated=true`, `readOnly=true`, `externalWritesAttempted=false`
- support runbook: `runbookStatus=ACTIVE`
- observation window: genuine timestamps and `complete=true`
- scope approval: exact candidate ID and `decision=APPROVED`
- policy/production evidence: machine-generated exact-SHA proof only

## Support-runbook activation checklist

This runbook may be declared ACTIVE only when all items below are true:

- [ ] document exists in the release candidate under version control
- [ ] production identity and exact-SHA procedure verified
- [ ] PM2 runtime identity is verified with exact build ID plus deploy-state provenance; canonical-source runtime also matches the exact release Git SHA
- [ ] Stage 1 safe baseline is documented
- [ ] health/readiness commands are valid
- [ ] monitoring checklist is actionable
- [ ] critical-incident triage is actionable
- [ ] duplicate-send procedure is actionable
- [ ] emergency-stop policy is documented
- [ ] rollback procedure references the canonical rollback script
- [ ] authenticated read-only smoke constraints match governance validators
- [ ] escalation matrix is present
- [ ] evidence capture requirements match canonical recorder/governance contracts
- [ ] no step auto-promotes Stage 2 or enables external writes
- [ ] operator validation completed on the exact candidate SHA

Checking this list does not itself write `PHASE17_SUPPORT_RUNBOOK_ACTIVE` evidence.

## Observation window

Do not invent an observation window. Capture a real start and end timestamp after the support runbook is active and monitoring is operating. The end timestamp must be at or after the start and must not be later than the evidence verification timestamp.

## Exit condition

Support readiness is complete only when the runbook is version-controlled, validated against the current release candidate, operationally usable, and separately attested/recorded as `PHASE17_SUPPORT_RUNBOOK_ACTIVE` with `runbookStatus=ACTIVE` for the exact live SHA.

Until then, keep Stage 2 unpromoted and external writes OFF.
