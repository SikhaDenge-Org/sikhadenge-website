# SikhaDenge WhatsApp AI Agent

This folder is the isolated application module for the SikhaDenge WhatsApp inbox, AI admissions agent, lead qualification, analytics, and human handoff system.

## Non-negotiable boundaries

- WhatsApp-specific business logic stays inside `modules/whatsapp-agent`.
- Next.js route handlers and pages remain thin adapters; they must call this module instead of containing business logic.
- Meta credentials, AI provider keys, webhook secrets, and database credentials must only be read from server-side environment variables.
- The agent must not invent fees, offers, schedules, certificates, policies, or course modules.
- High-risk or low-confidence replies must be handed to a human counselor.
- Learning is controlled and auditable. The agent must never silently retrain itself from raw customer conversations.

## Planned structure

```text
modules/whatsapp-agent/
├── ai/                  # intent, planning, response drafting, confidence checks
├── analytics/           # operational and conversion metrics
├── application/         # use cases and orchestration services
├── config/              # typed module configuration
├── domain/              # entities, enums, value objects, interfaces
├── integrations/
│   ├── meta/            # WhatsApp Cloud API client and webhook parser
│   └── llm/             # provider-neutral AI adapter
├── knowledge/           # approved course facts and retrieval contracts
├── learning/            # feedback queue and approval-based improvements
├── persistence/         # repository interfaces and Prisma adapters
├── security/            # signature checks, redaction, permissions, audit
├── ui/                  # reusable dashboard-only components
└── tests/               # unit, integration and policy tests
```

## Thin Next.js adapters

```text
app/api/whatsapp/webhook/route.ts
app/api/whatsapp/messages/route.ts
app/api/whatsapp/conversations/route.ts
app/api/whatsapp/agent/route.ts
app/(dashboard)/whatsapp/inbox/page.tsx
app/(dashboard)/whatsapp/contacts/page.tsx
app/(dashboard)/whatsapp/leads/page.tsx
app/(dashboard)/whatsapp/analytics/page.tsx
app/(dashboard)/whatsapp/settings/page.tsx
```

## Agent decision pipeline

```text
Incoming message
→ Validate webhook and normalize payload
→ Detect opt-out, abuse, safety and policy signals
→ Load contact, conversation and lead context
→ Detect language, intent, stage and urgency
→ Retrieve only approved SikhaDenge knowledge
→ Build a response plan
→ Draft a reply
→ Validate facts, tone, policy and confidence
→ Auto-send or route to human review
→ Store concise decision metadata and outcome
```

The system stores a concise decision summary, selected knowledge references, confidence, actions and outcome. It must not store or expose private hidden reasoning.

## Controlled learning model

The agent learns through three governed layers:

1. **Approved knowledge updates** — course, fee, schedule, policy and FAQ changes published by an administrator.
2. **Conversation memory** — user-specific facts needed to continue that lead's conversation.
3. **Feedback learning queue** — successful counselor replies, corrections and failed AI answers become suggestions. An administrator must approve them before they affect future answers.

Raw chats do not automatically become permanent knowledge.

## Phase 1 acceptance criteria

- Folder and dependency boundaries are documented and enforced.
- Domain contracts and decision pipeline are typed.
- Learning rules and human-approval rules are explicit.
- No production credentials are committed.
- No existing website behavior is changed.
