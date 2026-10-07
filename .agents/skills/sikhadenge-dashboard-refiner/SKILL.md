---
name: sikhadenge-dashboard-refiner
description: Audit and refine every SikhaDenge WhatsApp Agent dashboard page for advanced UI, UX, accessibility, responsive behaviour, React/Next.js performance, and regression-safe functionality while preserving all existing APIs, actions, permissions, webhooks, database logic, and WhatsApp integrations.
---

# SikhaDenge Dashboard Refiner

Use this skill for any UI/UX, responsive, accessibility, interaction, performance, or page-functionality work inside `apps/whatsapp-agent-dashboard`.

This workflow combines the intent of these maintained open-source skills:

- Vercel `web-design-guidelines`
- Vercel `react-best-practices`
- Anthropic `frontend-design`
- Anthropic `webapp-testing`

Fetch the latest upstream web-interface guidelines before every major review. Do not rely on a stale copied checklist.

## Non-negotiable constraints

1. Preserve every existing route, field, button, action, API call, webhook, permission check, Prisma/database operation, WhatsApp/Meta integration, polling loop, upload flow, and authentication behaviour unless the task explicitly requests a functional change.
2. Never replace working business logic with mock data or visual-only placeholders.
3. Keep server components server-side unless client state is genuinely required.
4. Do not merge or deploy without TypeScript, production build, and responsive interaction checks.
5. Preserve the production branch `deploy/whatsapp-live-combined-20260727` and create a rollback pointer before live deployment.
6. Restart only the PM2 process `sikhadenge-whatsapp-agent`.
7. Preserve the approved live header logo and global favicon.

## Product direction

The interface is a high-trust operations console for managing students, leads, WhatsApp conversations, campaigns, automations, templates, knowledge, integrations, team workflows, and administration.

Design direction: refined operational minimalism. It should feel fast, calm, clear, professional, and trustworthy rather than decorative or generic. Use the existing Inter font and current SikhaDenge blue/neutral visual language.

## Required responsive matrix

Validate all important flows at these viewport classes:

- Small phone: 360 × 800
- Standard phone: 390 × 844
- Large phone: 430 × 932
- Portrait tablet: 768 × 1024
- Landscape tablet: 1024 × 768
- Laptop: 1366 × 768
- Desktop: 1440 × 900
- Large desktop: 1920 × 1080

No horizontal page scroll is allowed. Dense tables may use an intentional, labelled internal scroll container or switch to cards on narrow screens.

## Execution workflow

### 1. Inventory before editing

- Enumerate all application routes and the component rendered by each route.
- Identify shared shells, shared CSS, navigation, forms, tables, modals, drawers, status badges, uploads, search/filter controls, and destructive actions.
- Map every handler and API call before changing markup.
- Record page-specific risks.

### 2. Establish shared foundations first

Improve the shared shell before page-specific styling:

- clear page hierarchy and contextual descriptions
- accessible skip link and landmarks
- consistent navigation, active states, focus states, and keyboard order
- responsive desktop rail, tablet rail, mobile menu, and mobile action dock
- coherent spacing, typography, form controls, buttons, cards, tables, empty states, errors, and loading states
- touch targets of at least 44 × 44 px for primary mobile interactions
- reduced-motion support

### 3. Page refinement order

1. Shared shell and design tokens
2. Inbox
3. Contacts
4. Leads
5. Team
6. Engagement
7. Analytics
8. Knowledge
9. Agent Training
10. Campaigns
11. Automation
12. Templates
13. Integrations
14. Admin
15. Cutover
16. Settings
17. Login and remaining utility routes

### 4. UI and UX rules

- One clear primary action per task area.
- Group related actions; separate destructive actions.
- Use concise labels and visible status feedback.
- Never use colour as the only status indicator.
- Provide labels for icon-only controls.
- Preserve user input during recoverable failures.
- Use inline validation near the relevant field.
- Confirm destructive actions and explain consequences.
- Make empty states actionable.
- Keep filters visible and resettable.
- Make selected rows/cards unmistakable.
- Use sticky headers only when they do not hide focused content.
- Avoid excessive shadows, gradients, oversized headings, and unnecessary animation.

### 5. Accessibility rules

- Semantic landmarks and headings must remain ordered.
- Every interactive element must be keyboard reachable.
- Use `:focus-visible` with a high-contrast ring.
- Inputs require associated labels; errors require accessible descriptions.
- Dialogs/drawers must have names and logical focus behaviour.
- Tables require real headers and meaningful captions/labels where needed.
- Status changes should use appropriate live regions when they occur without navigation.
- Honour `prefers-reduced-motion`.

### 6. React and Next.js performance rules

- Avoid unnecessary client components and state duplication.
- Avoid client-side data-fetching waterfalls.
- Parallelise independent server work.
- Keep event handlers stable where it materially reduces renders.
- Memoise only when measurement or component cost justifies it.
- Avoid shipping large libraries for small visual effects.
- Preserve route-level loading/error boundaries when present.
- Keep list keys stable and derived from persistent identifiers.

### 7. Functional verification

For every changed page verify:

- navigation and active state
- search, filters, sorting, pagination, and reset behaviour
- create/edit/save/cancel flows
- validation and error states
- destructive confirmation
- uploads and attachment removal
- modal/drawer open, close, escape, and keyboard flow
- permissions and disabled states
- API requests and optimistic/pessimistic feedback
- responsive visibility and no hidden critical action
- browser console errors

For Inbox additionally verify:

- conversation switching
- send button and Enter behaviour
- attachment upload
- AI/manual mode switching
- takeover
- mark read
- resolve/reopen
- template picker hook
- Template Centre navigation
- polling and message refresh

### 8. Quality gates

Run before every PR:

```bash
npm run typecheck
npm run build
```

Then execute browser checks across the responsive matrix and capture before/after screenshots for representative pages.

### 9. Change discipline

- Prefer shared components and scoped styles over repeated page patches.
- Keep each PR focused and reversible.
- Do not mix unrelated backend/business-logic changes into visual refinement PRs.
- Document changed routes, tested flows, responsive viewports, and remaining risks.

## Completion standard

A page is complete only when it is visually coherent, keyboard accessible, responsive at all required viewports, functionally verified, free of console errors, typecheck-clean, production-build-clean, and consistent with the shared dashboard system.
