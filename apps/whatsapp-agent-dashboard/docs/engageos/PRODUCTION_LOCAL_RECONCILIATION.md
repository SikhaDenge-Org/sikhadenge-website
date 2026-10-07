# Production-local reconciliation

## Source evidence

Production Batch #13 preserved the exact 10-file live tracked patch before any cleanup or deployment. The protected plaintext patch SHA-256 is:

`668679fbccc7eed4b189e8ba4f95f3abbb49db19428765e43b6ed0c6558f739a`

The reviewed functional subset used for reconciliation has SHA-256:

`c2b5cc150edd3fac2efd5d9c32928462737baca1b5b9bdb036acc1d183ed35b2`

## Included behavior

The reconciliation intentionally preserves the production-only behavior that was not represented by the release branch:

- read-only analytics service bearer authorization with dashboard-session fallback;
- Inbox Recent / History scopes using a 24-hour boundary and `limit=all` support;
- default Inbox server render using the Recent scope;
- Last 24 Hours / History UI switching and scope-aware refresh cadence;
- MIME-aware media presentation;
- WhatsApp template-message text reconstruction using stored template bodies and outbound parameters;
- Manrope typography while preserving the release branch service-worker registration.

The recovered query, template-rendering and service-token rules are centralized in testable policy modules and covered by a regression test wired into `test:agent`.

## Explicit exclusions

The following recovered dirty changes are not carried as production-local source changes:

- `next-env.d.ts`: generated framework noise;
- exact Prisma `6.12.0` package pins: not proven necessary, so the reviewed release ranges remain unchanged;
- `scripts/masterclass-flow-worker.ts`: the recovered `timer.unref()` removal is already represented by release commit `7ffbfbbde125ad47f022cfad921139c33b00ba0f` and is therefore a duplicate rather than a missing production-only change.

## Deployment boundary

This reconciliation does not clean or modify the production worktree and does not deploy anything. Production remains at the existing live source until this branch is reviewed, full CI is green, and a separate hash-locked production cleanup/deploy procedure verifies the original live SHA and dirty-patch digest before changing tracked files.
