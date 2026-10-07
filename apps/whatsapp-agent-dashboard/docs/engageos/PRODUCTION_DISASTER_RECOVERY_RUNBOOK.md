# WhatsApp Agent Production Disaster Recovery Runbook

Updated: 2026-09-19

This is the canonical production recovery runbook for the SikhaDenge WhatsApp Agent. It covers incident triage, application rollback, database backup verification, restore-readiness checks, secret rotation, evidence retention, and recovery objectives.

## Scope

Production:
- Application: `https://whatsapp.sikhadenge.in`
- PM2 process: `sikhadenge-whatsapp-agent`
- Live app: `/var/www/sikhadenge-whatsapp-agent/source/apps/whatsapp-agent-dashboard`
- Protected backups: `/root/sikhadenge-backups/engageos-<run-id>`
- Canonical deployment workflow: `.github/workflows/whatsapp-agent-production-batch1.yml`
- DR readiness workflow: `.github/workflows/whatsapp-agent-dr-readiness.yml`

## Recovery objectives

### Application RTO

Target application recovery time: **30 minutes** from confirmed rollback decision to:
- previous source SHA restored,
- previous Next.js build restored,
- Prisma client regenerated,
- PM2 online,
- login HTTP 200 verified.

The automated application rollback script is:
`scripts/engageos-production-rollback.sh`.

This is an operational target, not a contractual SLA. Every incident must record actual elapsed recovery time.

### Database RPO

Current database recovery points are **pre-deployment backups** created by the guarded production batch.

Current status:
- `RPO_MODE=PRE_DEPLOY_BACKUP_ONLY`
- `CLOCK_BASED_RPO_GUARANTEE=NONE`

Do not claim a 1-hour, 24-hour, or other clock-based database RPO until an independently scheduled database-backup service is implemented and verified.

The DR readiness workflow measures backup age on every verification run so operators can see how old the latest protected recovery point is.

## Incident severity

| Severity | Examples | First action |
| --- | --- | --- |
| SEV-0 | uncontrolled outbound, auth bypass, cross-workspace data exposure, destructive data corruption | disable external writes, preserve evidence, stop rollout, security/governance escalation |
| SEV-1 | production unavailable, repeated provider failure, failed migration/activation, corrupted build | freeze changes, collect evidence, decide rollback |
| SEV-2 | degraded feature, queue lag, partial automation failure | contain affected capability, investigate, avoid broad rollback unless required |

## Incident command sequence

1. Stop further rollout and avoid unrelated production changes.
2. Record incident start UTC, current live SHA, current build ID, PM2 status, and affected capability.
3. Preserve workflow logs and production evidence before changing state.
4. For outbound safety incidents, restore SHADOW/no-external-writes or enable applicable kill switches.
5. Decide whether the fault is application-build/source, migration/data, provider configuration, or credentials.
6. Use the canonical application rollback only when its preconditions are met.
7. Re-run login/PM2/provider/readiness checks after recovery.
8. Record actual RTO and the recovery point used.
9. Open a reviewed corrective PR before reactivation.

## Backup verification

The production deployment backup is accepted only when:
- `database.dump` is non-empty,
- `database.dump.sha256` verifies,
- `database.list` is non-empty,
- `database.list.sha256` verifies,
- `pg_restore --list` can read the dump,
- a schema-only extraction from the custom-format dump succeeds,
- previous source SHA and build ID are present.

The independent verifier is:
`scripts/engageos-production-dr-verify.sh`.

It is read-only with respect to the production database. It does not create, overwrite, or drop a database.

## Restore drill boundary

The automated DR readiness drill intentionally validates dump readability and schema extraction **without restoring into the production database**.

A full data restore into a disposable PostgreSQL instance is a separate high-risk drill and must:
- use an isolated database/server,
- never target the production database name,
- require an explicitly reviewed workflow,
- verify row/schema consistency,
- destroy the disposable restore target after evidence capture.

## Application rollback SOP

Rollback is permitted only when `deploy-state.txt` identifies the previous source/build state.

The canonical rollback:
- restores previous `.next`,
- restores previous source SHA,
- validates source/build IDs,
- regenerates Prisma client,
- restarts only the WhatsApp Agent PM2 process,
- verifies PM2 online,
- verifies login HTTP 200,
- writes `rollback-evidence.txt`.

Database schema rollback is not automatically attempted because production migrations are required to be additive/backward-compatible.

## Secret rotation SOP

Rotate a secret immediately if compromise is suspected, ownership changes, access is no longer required, or provider credentials are revoked.

Rotation order:
1. create/retrieve replacement secret at the provider,
2. update the GitHub production environment secret or server-side secret store,
3. validate syntax/presence without printing secret values,
4. restart/reload only the minimum required process,
5. verify provider identity/health,
6. revoke the old secret at the provider,
7. record rotation UTC, owner, system, and verification result.

Never place secret values in:
- Git history,
- PR descriptions,
- workflow logs,
- DR artifacts,
- issue comments,
- chat transcripts used as operational evidence.

High-value rotation domains include:
- production SSH key,
- Meta/WhatsApp credentials,
- Instagram/Facebook/Messenger credentials,
- database credentials,
- session/auth secrets,
- webhook secrets,
- public API key encryption/signing material.

## Ownership and approvals

Operational ownership must be explicit for every incident:
- Incident commander: coordinates stop/recovery decision.
- Deployment operator: runs guarded workflow/rollback.
- Data owner: approves any database restore drill.
- Security owner: owns credential compromise and rotation.
- Product owner: approves reactivation of customer-facing write capabilities.

If a named person is unavailable, assign the role before executing recovery. Do not infer approval from repository access alone.

## Evidence required to close an incident

- incident start/end UTC,
- live SHA before and after,
- build ID before and after,
- workflow/run IDs,
- backup directory and backup age,
- checksum verification result,
- rollback evidence when rollback executed,
- PM2/login verification,
- provider/write-safety state,
- root cause,
- corrective PR,
- actual RTO,
- recovery point timestamp and effective RPO for that incident.

## DR readiness workflow

`WhatsApp Agent DR Readiness` runs daily and can be dispatched manually.

It verifies the latest protected backup and uploads only non-sensitive readiness evidence. It does not upload:
- database dumps,
- database URLs,
- environment files,
- access tokens,
- SSH private keys,
- provider secrets.

Required success marker:
`PASS: PRODUCTION_DR_READINESS_VERIFIED`

## Stop conditions

Do not proceed with a restore/rollback when:
- the intended backup checksum fails,
- the dump catalog cannot be read,
- target source/build evidence is missing,
- the requested target is ambiguous,
- production database identity is not positively known,
- a restore command could point at production unintentionally,
- evidence preservation has not completed,
- an unresolved SEV-0 safety condition remains.

