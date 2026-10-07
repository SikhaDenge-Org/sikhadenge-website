# Phase 0 Completion Record

## Status

Phase 0 stabilization and source-of-truth reconciliation is complete for the release deployed on 2 August 2026.

This record captures the evidence used to close the stabilization gate. It does not authorize future production deployment, database migration, infrastructure mutation, or feature rollout without a separate controlled release decision.

## Canonical source of truth

| Item | Verified value |
|---|---|
| Repository | `maihoonankitsingh/sikhadenge-website` |
| Application | `apps/whatsapp-agent-dashboard` |
| Canonical release branch | `release/whatsapp-instagram-agent-flow-20260731` |
| Deployed release SHA | `a17a92761bebc93eea76c7c443933b5a0c3443e3` |
| Stabilization PR | `#57` — Stabilize responsive Inbox composer behavior |
| Production app directory | `/var/www/sikhadenge-whatsapp-agent/source/apps/whatsapp-agent-dashboard` |
| PM2 process | `sikhadenge-whatsapp-agent` |
| Public origin | `https://whatsapp.sikhadenge.in` |
| Deployed Next.js build ID | `9uuYV4kVWB0HoeRWv25kX` |
| Pre-deploy source SHA | `3ed5168cb5976812964f79524321e880e4af5e41` |
| VPS rollback branch | `backup/vps-before-phase0-a17a927-20260802-1458` |
| Build rollback directory | `.next-before-phase0-20260802_151333` |

## GitHub reconciliation evidence

- Production-target branch was verified at `656df86ff71c58013961797463e599e8dc2627cf` before the release workflow.
- Release branch was verified as a descendant of the production-target branch with zero reverse divergence.
- PR `#57` was reviewed, had no unresolved review threads or submitted change requests, and was squash-merged into the release branch.
- The VPS remote-tracking reference was found stale and refreshed explicitly from the GitHub branch ref before deployment.
- Final VPS source update was a one-commit fast-forward from `3ed5168...` to `a17a927...`.
- No tracked source modifications were present before the fast-forward.

## Critical defect resolution

The two blocking responsive Inbox defects identified after PR `#55` are resolved:

1. The runtime composer dock now uses z-index `1100`, below the template overlay at `1200`, so modal actions remain visible and clickable.
2. Compact composer controls restore after a touch/coarse-pointer viewport widens past the real visible-chat breakpoint.

Regression coverage includes:

- template modal stacking and Queue button hit testing
- compact-to-expanded control restoration
- mobile, tablet, and desktop composer visibility and bounds

## Automated validation evidence

GitHub Actions validation for PR `#57` passed on head `9a86d2a8ea9ada69b2f85bb5087cdf22b137b7ab`.

Validated checks included:

- dependency installation
- Prisma schema validation and client generation
- admission flow tests: 19 cases
- contextual message tests: 11 cases
- conversation feedback tests: 8 cases
- social webhook agent bridge tests: 4 cases
- Inbox composer layout tests: 5 assertions
- TypeScript `tsc --noEmit`
- optimized Next.js production build
- authenticated Chromium regression: 3/3 scenarios

A second isolated VPS worktree validation was completed against the exact release SHA before promotion. It produced build ID `9uuYV4kVWB0HoeRWv25kX` without touching the running `.next` directory or PM2 process.

## Production release evidence

The validated `.next` build was promoted with an atomic directory swap and automatic rollback procedure.

Final production checks:

| Check | Result |
|---|---|
| Git SHA | `a17a92761bebc93eea76c7c443933b5a0c3443e3` |
| Build ID | `9uuYV4kVWB0HoeRWv25kX` |
| PM2 status | `online` |
| PM2 unstable restarts | `0` |
| Public `/login` | HTTP `200` |
| Public `/inbox` | HTTP `307` authentication redirect |
| Public `/contacts` | HTTP `307` authentication redirect |
| Public `/analytics` | HTTP `307` authentication redirect |
| WhatsApp verification challenge | exact challenge returned |
| PM2 error log after release | empty |

## Database and migration statement

- PR `#57` contains no Prisma schema change.
- No production database migration was executed.
- The isolated browser job uses an empty CI-only PostgreSQL database and `prisma db push`; it does not touch production data.
- A database rollback was therefore not required for this release.
- Future additive schema work begins in Phase 1 and must include an explicit migration plan, backup identifier, compatibility mapping, and rollback decision before production execution.

## Environment and secret handling

- Secret values were not written to GitHub documentation, CI logs, or committed files.
- Production verification used the existing `WHATSAPP_VERIFY_TOKEN` variable by name only.
- Existing application configuration includes database, session/authentication, Meta channel, and AI provider settings; Phase 1/2 must formalize typed configuration ownership and validation without exposing secret values to the browser.

## Current channel capability baseline

Statuses below are intentionally conservative. `working` requires controlled API or production evidence.

| Capability | WhatsApp | Instagram | Messenger |
|---|---|---|---|
| Webhook verification | working | partial | partial |
| Inbound messages | working | partial | partial |
| Outbound text | working | partial | blocked in dashboard |
| Outbound media | working | partial | blocked in dashboard |
| Delivery/read state | partial | partial | partial |
| AI automatic reply | working/guarded | partial | partial |
| Human dashboard reply | working | partial | intentionally disabled |
| Human takeover/mode | working | partial | partial |
| Conversation history | working | partial | partial |
| Comment automation | N/A | not implemented | not implemented |

Unsupported or unverified capabilities must remain disabled instead of being represented as live.

## Generated and untracked VPS artifacts

The following existing untracked paths were recorded and deliberately left untouched:

- `.next-before-messenger-live-20260731_160047/`
- `.next.contract-v6-old-20260727_162503/`
- `.next.contract-v8-old-20260727_191259/`
- `.next.failed-20260727_162503/`
- `public/dashboard-icons-new/`

They are not part of the canonical source tree and must not be silently deleted or promoted.

## Exit decision

The Phase 0 stabilization gate is closed because:

- the canonical GitHub release and exact live VPS SHA are known
- the source update was fast-forward-only
- critical responsive review findings are resolved
- Prisma validation, tests, TypeScript, production build, and authenticated browser checks pass
- existing WhatsApp verification and protected-route behavior remain operational
- source and build rollback points are recorded
- no database or environment mutation was introduced

## Next authorized repository action

Create a Phase 1 branch from `release/whatsapp-instagram-agent-flow-20260731` at or after `a17a927...` and implement channel-neutral domain contracts additively. Existing WhatsApp reads, writes, webhook routes, outbound behavior, and database models must remain unchanged until Phase 1 contracts and migration design pass review.