# Phase 0 Execution Checklist

## Objective

Stabilize and reconcile the current `whatsapp.sikhadenge.in` application before introducing omnichannel schema or feature work.

No item in this checklist authorizes deployment, merge, database migration, PM2 restart, or VPS mutation without explicit approval.

## A. GitHub baseline

- [ ] Record exact production-target branch SHA.
- [ ] Record exact latest release branch SHA.
- [ ] Compare production target to release.
- [ ] Classify changed files by Inbox, webhook, channel adapter, AI, database, test, and CI.
- [ ] List open/superseded WhatsApp-related PRs.
- [ ] List unresolved non-outdated review threads.
- [ ] Select the canonical Phase 0 implementation base.
- [ ] Record why that base is safe.

## B. VPS read-only verification

- [ ] Record current directory.
- [ ] Record live branch.
- [ ] Record live commit SHA and latest commit message.
- [ ] Record `git status --short`.
- [ ] Record remote production branch SHA using read-only remote lookup.
- [ ] Record remote release branch SHA using read-only remote lookup.
- [ ] Record PM2 status, script path, working directory, uptime, and restart count.
- [ ] Verify local port `3100` login response.
- [ ] Verify public `https://whatsapp.sikhadenge.in/login` response.
- [ ] Verify protected-route authentication behavior.
- [ ] Identify untracked or generated files that could affect deployment.

## C. Database and migrations

- [ ] Record current Prisma migration directory contents.
- [ ] Record production migration status without changing schema.
- [ ] Back up current database before any future migration.
- [ ] Capture current table/model counts required for regression.
- [ ] Confirm unique constraints for external message IDs and webhook event keys.
- [ ] Identify schema changes existing in release but not live.
- [ ] Document rollback behavior for each pending migration.

## D. Environment and connection inventory

Record names and presence only; never commit secret values.

- [ ] WhatsApp app/account/phone identifiers.
- [ ] WhatsApp webhook verify secret name.
- [ ] Meta app secret name.
- [ ] Instagram account/page identifiers.
- [ ] Messenger Page identifiers.
- [ ] database connection variable name.
- [ ] authentication/session secrets.
- [ ] AI provider configuration names.
- [ ] feature flags and live outbound switches.
- [ ] webhook callback URLs and challenge behavior.
- [ ] token expiry/revocation risks.

## E. Existing capability matrix

For each channel classify `working`, `partial`, `UI only`, `blocked`, or `not implemented`.

| Capability | WhatsApp | Instagram | Messenger |
|---|---|---|---|
| Webhook verification | [ ] | [ ] | [ ] |
| Inbound messages | [ ] | [ ] | [ ] |
| Outbound text | [ ] | [ ] | [ ] |
| Outbound media | [ ] | [ ] | [ ] |
| Delivery/read state | [ ] | [ ] | [ ] |
| AI automatic reply | [ ] | [ ] | [ ] |
| Human reply | [ ] | [ ] | [ ] |
| Human takeover | [ ] | [ ] | [ ] |
| Conversation history | [ ] | [ ] | [ ] |
| Comment events | N/A | [ ] | [ ] |
| Public comment reply | N/A | [ ] | [ ] |
| Private comment reply | N/A | [ ] | [ ] |

Every `working` status requires API or controlled live evidence.

## F. Known defects

- [ ] Fix composer/modal layering so the composer cannot intercept modal actions.
- [ ] Fix responsive state restoration after viewport width increases.
- [ ] Test resize and orientation changes without reloading.
- [ ] Test phone/tablet/desktop composer visibility.
- [ ] Test Messenger text-only attachment guard.
- [ ] Test Instagram/Messenger channel note and send status.
- [ ] Verify no duplicate webhook processing.
- [ ] Verify failed outbound state and retry behavior.
- [ ] Verify AI/human mode changes are channel-safe.

## G. Required automated tests

### Authentication

- [ ] valid login
- [ ] invalid login
- [ ] logout
- [ ] expired/revoked session
- [ ] protected API authorization

### Inbox

- [ ] conversation list
- [ ] conversation selection
- [ ] message timeline
- [ ] manual text send per supported channel
- [ ] media restrictions per channel
- [ ] assignment
- [ ] status change
- [ ] AI/human/pause mode
- [ ] notes and tags
- [ ] failed send display

### Webhooks

- [ ] valid verification challenge
- [ ] invalid verification secret
- [ ] valid signature
- [ ] invalid signature
- [ ] duplicate event
- [ ] malformed payload
- [ ] unsupported event
- [ ] retryable provider failure

### Responsive browser coverage

- [ ] narrow phone
- [ ] standard phone
- [ ] tablet portrait
- [ ] tablet landscape
- [ ] desktop
- [ ] browser resize narrow to wide
- [ ] browser resize wide to narrow
- [ ] modal open while composer dock is active

## H. CI requirements

- [ ] clean dependency install
- [ ] Prisma validate
- [ ] Prisma generate
- [ ] TypeScript check
- [ ] agent tests
- [ ] webhook/channel tests
- [ ] production build
- [ ] browser tests or documented protected-environment equivalent

## I. Rollback package

- [ ] exact pre-change commit
- [ ] exact feature flags
- [ ] database backup identifier
- [ ] migration rollback/app rollback decision
- [ ] PM2 process recovery commands
- [ ] Nginx verification commands
- [ ] local and public smoke checks
- [ ] emergency outbound kill-switch procedure

## Phase 0 exit evidence

Phase 0 can be marked complete only when the PR records:

- canonical source branch and SHA
- current live VPS branch and SHA
- production/release comparison
- resolved critical UI review findings
- database migration state
- capability matrix
- passing CI and targeted browser evidence
- rollback runbook

## Next permitted action after Phase 0

Create the Phase 1 branch for channel-neutral domain contracts and additive schema design. Do not implement Instagram comment automations before the Phase 1 through Phase 4 foundations are reviewed, unless an explicitly isolated proof-of-concept branch is approved and cannot affect production.
