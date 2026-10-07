# Phase 9 — Visual Automation Graph Runbook

## Compatibility strategy

The existing Automation Flow Builder remains the primary editor during migration. It is not deleted or rewritten. Each saved linear flow can be projected into an EngageOS graph through the legacy-flow bridge.

Graph state is persisted additively through existing `WebhookEvent` storage, so Phase 9 introduces no Prisma migration:

- draft key: `automation-graph-draft:<flowId>`
- immutable publish key: `automation-graph-published:<flowId>:source-v<version>`

Published graph records are never updated. A flow source version can be published only once.

## API

- `GET /api/automation/flows/:flowId/graph` — graph workspace, stale state and published versions
- `POST /api/automation/flows/:flowId/graph` — sync current linear flow into graph draft
- `PATCH /api/automation/flows/:flowId/graph` — save an explicitly edited graph draft
- `POST /api/automation/flows/:flowId/graph/simulate` — deterministic graph dry run
- `POST /api/automation/flows/:flowId/graph/publish` — immutable publish snapshot

All routes require dashboard ADMIN or MANAGER.

## Publish safety

A graph cannot publish if validation reports missing trigger, duplicate IDs, dangling edges, self loops, cycles, or graph limits. A draft whose `sourceFlowVersion` differs from the current linear flow version is stale and cannot publish until re-synced.

Publishing does not activate runtime execution and does not send any external message.

## Simulator

Simulation is deterministic and always returns `outboundSent:false`. It supports trigger, action, delay, approval, goal, stop, condition and branch nodes. Condition/branch nodes may use `field`, `operator` and `value` config plus true/false-labelled edges. The simulator has a hard step limit even though cycles are rejected at validation.

## Runtime boundary

Graph publication is definition management only. External execution remains separately gated by automation runtime flags, outbound/channel policy, integration health and release rollout controls.

Production activation is not performed by this phase.
