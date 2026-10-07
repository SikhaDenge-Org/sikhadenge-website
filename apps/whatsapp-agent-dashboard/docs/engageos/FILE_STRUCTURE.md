# EngageOS Target File Structure

## Purpose

This document locks the target code organization for `apps/whatsapp-agent-dashboard`. New EngageOS work must follow these boundaries instead of adding unrelated logic to large shared files.

The target is a **modular monolith**: one deployable Next.js application with strict internal modules. A module may later be extracted into a service without rewriting its domain contract.

## Target application tree

```text
apps/whatsapp-agent-dashboard/
├── app/
│   ├── (auth)/
│   │   └── login/
│   ├── (dashboard)/
│   │   ├── inbox/
│   │   ├── contacts/
│   │   ├── leads/
│   │   ├── automations/
│   │   ├── campaigns/
│   │   ├── analytics/
│   │   ├── integrations/
│   │   ├── knowledge/
│   │   ├── learning/
│   │   ├── team/
│   │   ├── audit/
│   │   └── settings/
│   ├── api/
│   │   ├── v1/
│   │   │   ├── auth/
│   │   │   ├── workspaces/
│   │   │   ├── channels/
│   │   │   ├── conversations/
│   │   │   ├── messages/
│   │   │   ├── interactions/
│   │   │   ├── customers/
│   │   │   ├── leads/
│   │   │   ├── automations/
│   │   │   ├── campaigns/
│   │   │   ├── knowledge/
│   │   │   ├── analytics/
│   │   │   └── audit/
│   │   ├── webhooks/
│   │   │   ├── whatsapp/
│   │   │   ├── instagram/
│   │   │   ├── messenger/
│   │   │   ├── facebook/
│   │   │   ├── youtube/
│   │   │   ├── google-business/
│   │   │   ├── threads/
│   │   │   └── linkedin/
│   │   └── internal/
│   │       ├── workers/
│   │       ├── health/
│   │       └── diagnostics/
│   ├── error.tsx
│   ├── global-error.tsx
│   ├── layout.tsx
│   └── not-found.tsx
│
├── components/
│   ├── ui/
│   ├── layout/
│   ├── inbox/
│   ├── crm/
│   ├── automations/
│   ├── integrations/
│   ├── analytics/
│   └── shared/
│
├── modules/
│   ├── auth/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── presentation/
│   │   └── index.ts
│   ├── workspaces/
│   ├── channels/
│   │   ├── core/
│   │   │   ├── domain/
│   │   │   ├── application/
│   │   │   ├── contracts/
│   │   │   ├── infrastructure/
│   │   │   └── index.ts
│   │   ├── whatsapp/
│   │   │   ├── adapter/
│   │   │   ├── webhook/
│   │   │   ├── outbound/
│   │   │   ├── mapping/
│   │   │   ├── policy/
│   │   │   ├── tests/
│   │   │   └── index.ts
│   │   ├── instagram/
│   │   ├── messenger/
│   │   ├── facebook/
│   │   ├── youtube/
│   │   ├── google-business/
│   │   ├── threads/
│   │   └── linkedin/
│   ├── events/
│   │   ├── domain/
│   │   ├── ingestion/
│   │   ├── normalization/
│   │   ├── processing/
│   │   ├── retry/
│   │   ├── dead-letter/
│   │   ├── observability/
│   │   └── index.ts
│   ├── inbox/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── queries/
│   │   ├── commands/
│   │   ├── presentation/
│   │   └── index.ts
│   ├── customers/
│   ├── crm/
│   ├── automations/
│   │   ├── domain/
│   │   ├── builder/
│   │   ├── compiler/
│   │   ├── runtime/
│   │   ├── actions/
│   │   ├── conditions/
│   │   ├── triggers/
│   │   ├── validation/
│   │   ├── versioning/
│   │   ├── simulator/
│   │   └── index.ts
│   ├── ai/
│   │   ├── orchestration/
│   │   ├── intent/
│   │   ├── retrieval/
│   │   ├── memory/
│   │   ├── generation/
│   │   ├── evaluation/
│   │   ├── safety/
│   │   ├── handoff/
│   │   ├── providers/
│   │   └── index.ts
│   ├── knowledge/
│   ├── learning/
│   ├── campaigns/
│   ├── analytics/
│   ├── policy/
│   ├── audit/
│   ├── notifications/
│   └── media/
│
├── shared/
│   ├── config/
│   ├── database/
│   ├── cache/
│   ├── queue/
│   ├── crypto/
│   ├── errors/
│   ├── http/
│   ├── logging/
│   ├── observability/
│   ├── validation/
│   ├── feature-flags/
│   ├── idempotency/
│   ├── rate-limits/
│   ├── time/
│   ├── types/
│   └── testing/
│
├── workers/
│   ├── event-worker.ts
│   ├── automation-worker.ts
│   ├── outbound-worker.ts
│   ├── campaign-worker.ts
│   ├── media-worker.ts
│   ├── analytics-worker.ts
│   └── scheduler-worker.ts
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   ├── seed.ts
│   └── seeds/
│       ├── roles.ts
│       ├── permissions.ts
│       ├── default-workspace.ts
│       └── system-tags.ts
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── contract/
│   ├── browser/
│   ├── fixtures/
│   ├── factories/
│   ├── webhook-samples/
│   └── helpers/
│
├── scripts/
│   ├── verify-env.ts
│   ├── verify-webhooks.ts
│   ├── replay-event.ts
│   ├── migrate-legacy-data.ts
│   ├── check-tenant-isolation.ts
│   └── production-smoke.ts
│
├── docs/
│   └── engageos/
│       ├── README.md
│       ├── ARCHITECTURE.md
│       ├── FILE_STRUCTURE.md
│       ├── PHASES.md
│       ├── MIGRATION_MAP.md
│       ├── ENGINEERING_STANDARDS.md
│       └── adr/
│
├── instrumentation.ts
├── middleware.ts
├── package.json
└── tsconfig.json
```

## Module internal structure

Every business module should use only the layers it genuinely needs:

```text
module-name/
├── domain/          # Entities, value objects, domain events, pure policies
├── application/     # Use cases and orchestration
├── infrastructure/  # Prisma, Redis, HTTP clients, queues, storage
├── presentation/    # Route adapters, DTO mapping, view models
├── tests/           # Module-focused tests when colocated tests add value
└── index.ts         # Deliberate public exports only
```

### Dependency direction

```text
presentation -> application -> domain
infrastructure -> domain/application contracts
```

The domain layer must not import:

- Next.js
- Prisma Client
- React
- platform SDKs
- environment variables
- Redis clients
- HTTP clients

## Channel adapter structure

Each channel adapter owns only transport-specific behavior:

```text
modules/channels/instagram/
├── adapter/
│   ├── InstagramChannelAdapter.ts
│   └── InstagramCapabilities.ts
├── webhook/
│   ├── verifyInstagramWebhook.ts
│   ├── parseInstagramWebhook.ts
│   └── normalizeInstagramEvent.ts
├── outbound/
│   ├── sendInstagramMessage.ts
│   ├── replyToInstagramComment.ts
│   └── sendInstagramPrivateReply.ts
├── mapping/
│   ├── instagramMessageMapper.ts
│   └── instagramErrorMapper.ts
├── policy/
│   ├── instagramMessagingWindow.ts
│   └── instagramPrivateReplyPolicy.ts
├── tests/
└── index.ts
```

Channel adapters must not decide lead stages, AI prompts, assignment strategy, or business campaign logic.

## API route rule

API route files must stay thin:

```text
route.ts
  -> authenticate/verify
  -> validate input
  -> call one application use case
  -> map result to HTTP response
```

A route must not contain:

- long Prisma transactions
- direct AI orchestration
- platform-specific business rules
- automation graph execution
- multi-step campaign processing

## Component rule

Large page components must be decomposed into:

- feature container
- presentational components
- hooks
- typed API client
- view models
- isolated styles

A single Inbox component must not own channel detection, transport calls, conversation state, modal logic, responsive docking, and all UI rendering together.

## Naming rules

- Files containing React components: `PascalCase.tsx`
- Hooks: `useThing.ts`
- Pure services/functions: `camelCase.ts`
- Domain entities/value objects: `PascalCase.ts`
- Route handlers: `route.ts`
- Unit tests: `*.test.ts`
- Browser tests: `*.spec.ts`
- Platform constants: `instagramCapabilities.ts`, not `constants.ts`
- Avoid generic names such as `utils.ts`, `helpers.ts`, `service.ts`, or `common.ts` unless the scope is explicit.

## Public module exports

Cross-module imports must use each module's `index.ts` public API wherever practical. Deep imports into another module's infrastructure folder are prohibited.

Allowed:

```ts
import { executeAutomation } from "@/modules/automations";
```

Not allowed:

```ts
import { executeAutomation } from "@/modules/automations/runtime/internal/executeGraph";
```

## Legacy compatibility rule

Existing working code may remain temporarily in current locations during migration. New features must not expand legacy coupling. Each migration PR must document:

- legacy path
- target path
- compatibility adapter
- removal condition
- tests proving parity

No bulk folder move is allowed without regression evidence.
