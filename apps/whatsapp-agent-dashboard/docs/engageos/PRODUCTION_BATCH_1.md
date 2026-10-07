# EngageOS Production Batch 1

## Objective

Deploy the merged EngageOS Phase 1–2 foundation to the SikhaDenge WhatsApp Agent production server through GitHub Actions, while keeping all new security controls inactive.

The batch executes five guarded tasks:

1. create and verify a PostgreSQL custom-format backup
2. record the one-time Prisma baseline and apply the additive Phase 2 migration
3. build the exact merged release in an isolated worktree and activate it atomically
4. verify source SHA, build ID, PM2, public routes, webhook verification, migration state, membership backfill, and disabled feature flags
5. preserve rollback artifacts and automatically restore the previous application source/build if activation or verification fails

## GitHub workflow

```text
.github/workflows/whatsapp-agent-production-batch1.yml
```

The workflow supports:

- manual `workflow_dispatch` with an exact 40-character release SHA and `execute=true`
- automatic execution when a merge to `release/whatsapp-instagram-agent-flow-20260731` includes `[production-batch1]` in the merge commit title

The workflow uses the GitHub environment:

```text
whatsapp-agent-production
```

## Required GitHub configuration

Required environment or repository secrets:

```text
WHATSAPP_PROD_HOST
WHATSAPP_PROD_USER
WHATSAPP_PROD_SSH_PRIVATE_KEY
WHATSAPP_PROD_SSH_HOST_KEY
```

Optional environment or repository variable:

```text
WHATSAPP_PROD_SSH_PORT
```

When the port variable is absent, the workflow uses port `22`.

`WHATSAPP_PROD_SSH_HOST_KEY` must contain the pinned known-hosts entry. The workflow deliberately does not call `ssh-keyscan` at deployment time.

If any required secret is missing, the workflow fails before making an SSH connection or touching production.

## Server contract

The guarded workflow expects:

```text
Application: /var/www/sikhadenge-whatsapp-agent/source/apps/whatsapp-agent-dashboard
PM2 process: sikhadenge-whatsapp-agent
Public URL: https://whatsapp.sikhadenge.in
Backup root: /root/sikhadenge-backups
Release branch: release/whatsapp-instagram-agent-flow-20260731
```

The live tracked worktree must be clean. Known untracked `.next` backups and `public/dashboard-icons-new/` are preserved. `git clean` is never used.

## Gate before Task 1

The existing read-only production preflight runs against an isolated worktree at the exact release SHA.

It must confirm:

- exact release SHA
- clean isolated worktree
- master security switch absent or false
- PostgreSQL reachable
- all legacy tables present
- deployed legacy migration applied exactly once
- no failed, rolled-back, or unknown migration
- EngageOS migration not partially applied
- schema-only dump probe succeeds
- PM2 process exists
- login returns HTTP 200

## Task 1 — Verified backup

The workflow creates:

```text
/root/sikhadenge-backups/engageos-<github-run-id>/database.dump
```

The backup is accepted only when:

- `pg_dump --format=custom` succeeds
- the file is non-empty
- `pg_restore --list` succeeds
- SHA-256 evidence is written
- source SHA, build ID, PM2 state, and worktree state are recorded

The database dump remains on the server and is not uploaded to GitHub.

## Task 2 — Migration

Recognized production lineage:

```text
20260723160037_init_whatsapp_agent
20260802000000_baseline_existing_schema
20260802174500_add_engageos_security_persistence
```

The migration step requires:

- legacy migration count exactly `1`
- unknown migration count `0`
- failed/rolled-back count `0`
- baseline and additive counts each `0` or `1`
- EngageOS master switch absent or false

When needed, it records the baseline once and applies the additive migration. It then verifies:

- baseline count `1`
- additive count `1`
- default workspace exists
- membership count equals `DashboardUser` count
- exactly three EngageOS flags exist
- all three flags remain disabled

## Task 3 — Build and activation

The release is built in a detached temporary worktree with isolated dependencies.

Validation before activation:

- Prisma client generation
- strict TypeScript
- optimized production build
- non-empty new Next.js build ID
- target release is a fast-forward descendant of the live source
- tracked live worktree remains clean

Activation:

- create a Git rollback branch at the previous source SHA
- fast-forward the live release branch to the exact target SHA
- regenerate the live Prisma client
- preserve the previous `.next` directory
- atomically move the staged `.next` into place
- restart only `sikhadenge-whatsapp-agent`

No operating-system reboot is performed.

## Task 4 — Post-deploy verification

Required evidence:

- live source SHA equals target SHA
- live build ID equals staged build ID
- PM2 status `online`
- unstable restarts `0`
- `/login` returns `200`
- protected routes return `302` or `307`
- WhatsApp webhook verification returns challenge `987654`
- migration history is complete and clean
- membership backfill matches dashboard users
- all EngageOS flags remain disabled
- no new fatal PM2 error signature appears

## Task 5 — Rollback readiness

The workflow preserves:

- previous source SHA
- previous build ID
- previous `.next`
- database dump and checksum
- migration evidence
- activation state
- post-deploy evidence

If activation or post-deploy verification fails, the orchestrator automatically:

- restores the previous `.next`
- resets the live source to the recorded previous SHA
- regenerates the previous Prisma client
- restarts PM2
- verifies login HTTP 200
- preserves the failed build for investigation

The additive EngageOS tables are not dropped during application rollback. All flags remain disabled, so the previous application ignores them.

## GitHub evidence

The workflow uploads only non-sensitive text evidence and the workflow log for 14 days.

It does not upload:

- the database dump
- `.env`
- database URLs
- access tokens
- SSH keys
- provider credentials

## Success marker

The final workflow log must contain:

```text
PASS: ENGAGEOS_PRODUCTION_BATCH_1_COMPLETE
ENGAGEOS_PRODUCTION_BATCH_1_END
```

A failure after activation must also show either:

```text
PASS: AUTOMATIC_ROLLBACK_COMPLETED
```

or the explicit critical rollback failure marker for immediate operator intervention.
