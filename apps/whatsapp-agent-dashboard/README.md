# SikhaDenge WhatsApp Agent Dashboard

Standalone Next.js application intended for `https://dashboard.sikhadenge.in`.

## Why this is separate

- It has its own package, build and PM2 process.
- Public website pages and dependencies remain isolated.
- WhatsApp inbox releases can be deployed independently.
- Access control, webhook APIs and AI operations can use stricter security policies.

## Local development

```bash
cd apps/whatsapp-agent-dashboard
npm install
npm run dev
```

The development server runs on port `3100`.

## Current Phase 1 scope

- Premium inbox shell
- Conversation list
- AI/human mode switch
- Lead intelligence panel
- Qualification score
- Agent confidence and approved-knowledge indicators
- Controlled-learning explanation
- Responsive desktop/mobile layout

All displayed conversations are typed sample data. No Meta API, database, AI provider or production credential is connected in Phase 1.

## Next implementation sequence

1. Authentication and role-based access
2. Shared database schema and migrations
3. Meta webhook verification endpoint
4. Incoming message persistence
5. Manual outbound message API
6. Realtime inbox updates
7. AI decision service integration
8. Feedback and learning approval queue
9. Analytics and audit logs
10. PM2 and Nginx deployment for the dashboard subdomain
