# ADR 0001: Start EngageOS as a Modular Monolith

- Status: Accepted for foundation planning
- Date: 2026-08-02
- Scope: `apps/whatsapp-agent-dashboard`

## Context

The current product is a Next.js and Prisma application with working WhatsApp behavior and partial Instagram/Messenger work. EngageOS must add channel adapters, event processing, Inbox, CRM, automation, AI, knowledge, campaigns, analytics, and future tenant support.

Splitting these capabilities into multiple deployable services immediately would increase operational complexity before boundaries, traffic, failure modes, and scaling requirements are measured.

At the same time, continuing with unstructured shared files would make future changes unsafe and expensive.

## Decision

EngageOS will begin as one deployable modular monolith with explicit business modules, channel adapters, background workers, typed contracts, and dependency rules.

The web process, workers, and scheduler may run as separate processes while sharing the same repository and domain contracts.

## Required characteristics

- module ownership is explicit
- business modules expose deliberate public APIs
- channel-specific code remains inside channel modules
- long-running work runs through durable queues/workers
- database access is module-owned
- workspace isolation is enforced
- events and outbound actions are idempotent
- architecture decisions are documented

## Consequences

### Positive

- lower deployment and operational complexity
- easier transactional consistency during early migration
- faster reuse of the existing Next.js/Prisma foundation
- simpler local development and CI
- clear path to gradual extraction when evidence exists

### Negative

- module boundaries require discipline rather than network isolation
- one deployment can contain changes across multiple modules
- database growth and worker load must be monitored carefully
- careless shared utilities can reintroduce coupling

## Rejected alternative: immediate microservices

Rejected because it would require service discovery, distributed tracing, network failure handling, independent deployment pipelines, cross-service authentication, data ownership decisions, and distributed transaction patterns before the current system has stable channel-neutral contracts.

## Rejected alternative: continue current ad-hoc structure

Rejected because large mixed components and platform-specific business logic would make omnichannel expansion, testing, and future maintenance increasingly risky.

## Extraction triggers

A module may become a separate service only when at least one measured condition exists:

- independently dominant scaling need
- repeated failure isolation requirement
- materially different deployment cadence
- security/compliance isolation requirement
- database ownership can be separated cleanly
- team ownership requires independent lifecycle

An extraction requires a new ADR describing data ownership, API/event contracts, failure behavior, deployment, rollback, and observability.
