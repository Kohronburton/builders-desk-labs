# CrewUp Production Architecture

## Objective

CrewUp is a two-sided construction marketplace where General Contractor organizations publish scoped opportunities and Subcontractor organizations discover work, submit proposals, exchange project messages, and maintain verified company profiles.

The demo branch proves the end-to-end experience with deterministic local state. Production replaces those state boundaries with authenticated server actions and Supabase repositories without changing the core UX.

## Runtime architecture

```text
Browser
  └─ Next.js App Router on Vercel
       ├─ Server Components for authenticated reads
       ├─ Server Actions / Route Handlers for mutations
       ├─ Supabase Auth for sessions and recovery
       ├─ Supabase PostgreSQL with RLS
       ├─ Supabase Storage with signed URLs
       ├─ Stripe Checkout and Customer Portal
       ├─ Stripe webhook handler with idempotency
       └─ Transactional email + observability
```

## Security boundaries

1. The browser receives only the Supabase anonymous key and Stripe publishable key.
2. The Supabase service-role key and Stripe secret key are server-only.
3. Every tenant-owned table has row-level security enabled before production data is loaded.
4. Organization membership is the authorization primitive. Roles grant owner, admin, or member capability within an organization.
5. Project documents use private Storage buckets and short-lived signed URLs.
6. Stripe webhook events are persisted by event ID before side effects, preventing duplicate subscription changes.
7. Subscription access is derived from webhook-managed server state, never from a client-submitted plan value.

## Core domains

### Identity and tenancy

- `profiles`
- `organizations`
- `organization_members`
- organization type: `general_contractor` or `subcontractor`

### Marketplace

- `trades`
- `organization_trades`
- `projects`
- `project_trades`
- `project_files`
- `proposals`

### Communication

- `conversations`
- `conversation_participants`
- `messages`

### Billing and operations

- Stripe customer ID on the organization
- Webhook-controlled subscription status
- `stripe_events` idempotency ledger
- future audit events, reports, notifications, and moderation queues

## API and server-action boundaries

- `createProject(input)` validates role, membership, subscription limits, and scope fields.
- `publishProject(projectId)` verifies project ownership and required documents.
- `searchProjects(filters)` returns only open projects allowed by RLS.
- `submitProposal(input)` enforces one active proposal per project and subcontractor organization.
- `updateProposalStatus(input)` checks which party is allowed to perform each transition.
- `createConversation(projectId, participantOrgId)` verifies a valid project relationship.
- `sendMessage(input)` validates participant access, body length, and rate limits.
- `createCheckoutSession()` creates or reuses the organization Stripe customer.
- `stripeWebhook(request)` verifies the signature and processes each event once.

## Subscription model

The demo presents CrewUp Pro at `$79/month` only as a product-flow example. Production pricing must be confirmed before Stripe products are created.

Recommended initial gates:

- Free: verified profile, limited search, limited active projects or proposals, basic messaging.
- Pro: unlimited active work, advanced filters, analytics, priority placement, document exchange, and team seats.

This is Stripe Billing, not marketplace fund movement. Do not implement Stripe Connect until CrewUp decides to collect and distribute construction payments.

## Environment strategy

- `demo/*`: deterministic demo code and Vercel preview.
- `dev`: integration branch with development Supabase and Stripe test mode.
- `staging`: release candidate with staging Supabase and isolated Stripe test products.
- `prod`: production release branch with production secrets.
- `main`: frozen and outside the release path by explicit project rule.

Each environment receives a separate Supabase project, Storage buckets, Stripe webhook endpoint, email sending identity, and monitoring release marker.

## Production checklist

### Application

- Replace local state with typed repositories and server actions.
- Add signup, login, email verification, password reset, and invitation acceptance.
- Add organization onboarding and role-based route guards.
- Implement file upload, file validation, signed downloads, and virus scanning strategy.
- Add notifications, moderation, account suspension, and audit events.

### Quality

- Unit tests for validation and state transitions.
- RLS tests for cross-tenant denial and valid-party access.
- Integration tests for Stripe signature and replay handling.
- End-to-end tests for both role journeys.
- Accessibility review and mobile browser QA.

### Operations

- Sentry or equivalent error tracking.
- Structured logs with request and organization IDs.
- Database backups and point-in-time recovery.
- Migration review, forward-only rollout, and rollback runbook.
- Rate limiting, abuse controls, and support procedures.
- Privacy policy, terms, acceptable use, verification policy, and deletion workflow.

## Recommended delivery sequence

1. Foundation: Auth, organizations, memberships, route guards, RLS test harness.
2. Marketplace: profiles, projects, search, files, proposals, status transitions.
3. Communication: conversations, messages, notifications, transactional email.
4. Billing: Stripe Checkout, portal, webhooks, entitlements, billing recovery.
5. Trust and operations: admin console, moderation, audits, monitoring, backups.
6. Launch hardening: load testing, accessibility, SEO/public pages, support runbook.
