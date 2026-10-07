# Phase 2 Production Preflight

## Purpose

This procedure verifies whether the live WhatsApp Agent application and PostgreSQL database are safe to enter the Phase 2 migration window.

The preflight is read-only with respect to the production database. It does not:

- create or modify database tables
- record the Prisma baseline
- run `prisma migrate deploy`
- restart PM2
- change Nginx
- edit `.env`
- enable any EngageOS feature flag
- copy, decrypt, or rotate credentials

The production migration remains a separate explicitly approved operation.

## Script

```text
scripts/engageos-production-preflight.sh
```

The script validates:

- required Git, Node, npm, Prisma, PostgreSQL, and backup tools
- exact Git release SHA
- clean production worktree
- Prisma schema validity
- `ENGAGEOS_SECURITY_PERSISTENCE_ENABLED` is absent or false
- PostgreSQL connectivity without printing `DATABASE_URL`
- expected legacy application tables
- at least one `DashboardUser`
- Prisma migration history and unfinished/rolled-back records
- the deployed legacy migration `20260723160037_init_whatsapp_agent`
- known Phase 2 baseline and additive migration state
- EngageOS schema completeness when already migrated
- dashboard-user and workspace-membership count parity
- all three EngageOS feature flags remain disabled
- schema-only `pg_dump` connectivity probe
- PM2 process existence
- production `/login` HTTP 200

## Recognized migration lineage

The production database may contain only the following recognized migration names during this Phase 2 window:

```text
20260723160037_init_whatsapp_agent
20260802000000_baseline_existing_schema
20260802174500_add_engageos_security_persistence
```

`20260723160037_init_whatsapp_agent` is the original production migration that created the existing WhatsApp Agent schema. It is expected to be applied exactly once before the Phase 2 baseline is recorded.

The Phase 2 baseline and additive migrations must never be recorded or deployed by the preflight script.

## Required production directory

Run from:

```text
/var/www/sikhadenge-whatsapp-agent/source/apps/whatsapp-agent-dashboard
```

Do not run from a copied directory, temporary build directory, or unrelated checkout.

## Required inputs

The script requires the exact merged release commit:

```bash
EXPECTED_RELEASE_SHA=<MERGED_RELEASE_SHA>
```

It reads `DATABASE_URL` and the EngageOS master switch from `.env` without sourcing or executing the file. A different environment file may be selected with:

```bash
ENV_FILE=/absolute/path/to/environment-file
```

Optional overrides:

```bash
PM2_PROCESS_NAME=sikhadenge-whatsapp-agent
CHECK_HTTP_URL=https://whatsapp.sikhadenge.in
VERIFY_PG_DUMP=1
```

## Production command

After the preflight PR is merged, run from an isolated worktree at the exact merged release SHA. Do not move the live production checkout merely to execute a read-only preflight.

```bash
EXPECTED_RELEASE_SHA=<MERGED_RELEASE_SHA> \
ENV_FILE=/var/www/sikhadenge-whatsapp-agent/source/apps/whatsapp-agent-dashboard/.env \
PM2_PROCESS_NAME=sikhadenge-whatsapp-agent \
CHECK_HTTP_URL=https://whatsapp.sikhadenge.in \
VERIFY_PG_DUMP=1 \
bash scripts/engageos-production-preflight.sh \
  | tee "/root/engageos-phase2-preflight-$(date -u +%Y%m%dT%H%M%SZ).log"
```

The log contains no database password or full connection string.

## Required successful result

The final lines must include:

```text
PREFLIGHT_FAILURES=0
PREFLIGHT_STATUS=PASS
ENGAGEOS_PRODUCTION_PREFLIGHT_END
```

The evidence must also show:

```text
PASS: Git HEAD matches expected release SHA
PASS: Git worktree is clean
PASS: Prisma schema validates
PASS: EngageOS security master is inactive
PASS: PostgreSQL connection is reachable
PASS: Prisma migration history has no unfinished or rolled-back rows
PASS: deployed legacy Prisma migration is applied exactly once
PASS: Prisma history contains only recognized migration lineage
PASS: schema-only pg_dump probe succeeded
PASS: PM2 process exists: sikhadenge-whatsapp-agent
PASS: login route returned HTTP 200
```

## Accepted database states

### State A — current production before Phase 2 migration

Expected evidence:

```text
PRISMA_MIGRATION_TABLE_EXISTS=true
LEGACY_INIT_APPLIED_COUNT=1
UNKNOWN_MIGRATION_COUNT=0
BASELINE_APPLIED_COUNT=0
ADDITIVE_MIGRATION_APPLIED_COUNT=0
ENGAGE_WORKSPACE_TABLE_EXISTS=false
```

This is the expected live state before the Phase 2 baseline and additive migration are executed.

### State B — Phase 2 completed with controls inactive

Expected evidence:

```text
PRISMA_MIGRATION_TABLE_EXISTS=true
LEGACY_INIT_APPLIED_COUNT=1
UNKNOWN_MIGRATION_COUNT=0
BASELINE_APPLIED_COUNT=1
ADDITIVE_MIGRATION_APPLIED_COUNT=1
ENGAGE_WORKSPACE_TABLE_EXISTS=true
```

The output must additionally show:

- every `Engage*` table exists
- default workspace membership count equals `DashboardUser` count
- `engageos.route_permissions=false`
- `engageos.outbound_policy=false`
- `engageos.webhook_replay=false`

### Transitional state — baseline recorded, additive migration pending

Possible evidence:

```text
LEGACY_INIT_APPLIED_COUNT=1
BASELINE_APPLIED_COUNT=1
ADDITIVE_MIGRATION_APPLIED_COUNT=0
ENGAGE_WORKSPACE_TABLE_EXISTS=false
```

Do not proceed blindly. Confirm that this state resulted from the current approved migration window and that no earlier attempt failed.

### Migration history absent

A database with the legacy application tables but no `_prisma_migrations` table is not the currently observed production state. Treat it as a separate environment requiring explicit migration-history reconciliation before using the production procedure.

## Automatic blockers

Any of these results block migration or deployment:

- wrong Git SHA
- dirty worktree
- invalid Prisma schema
- EngageOS master switch true
- database unreachable
- missing legacy table
- no dashboard user
- unfinished or rolled-back migration
- deployed legacy migration missing or duplicated
- unknown migration record
- additive migration recorded while EngageOS tables are absent
- EngageOS tables present without both Phase 2 migration records
- partially present EngageOS schema
- membership count mismatch
- missing or enabled EngageOS flags
- `pg_dump` probe failure
- missing PM2 process
- login route not returning HTTP 200

Do not fix blockers by deleting migration history, dropping tables, force-resetting the checkout, or changing production flags without reviewing the exact evidence.

## Evidence handling

Retain these identifiers together:

- merged release SHA
- preflight log path
- preflight UTC timestamp
- PostgreSQL database name and version
- `DashboardUser` count
- legacy, baseline, additive, and unknown migration counts
- schema-dump probe SHA-256
- PM2 PID
- login HTTP status

Do not commit production logs, environment files, backups, or connection strings to GitHub.

## Next controlled operation

A successful preflight authorizes only the next review gate:

1. create a full PostgreSQL backup outside the application directory
2. verify the backup file exists, is non-empty, and has a SHA-256 identifier
3. record current database and application evidence
4. review the exact one-time baseline and additive migration commands

It does not itself authorize those commands or the application restart.
