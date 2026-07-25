# CrewUp Construction Marketplace Demo

A production-minded, interactive Next.js demo showing how CrewUp can connect general contractors with qualified subcontractors.

> Branch: `demo/crewup-marketplace`  
> Release path: `demo/* → dev → staging → prod`  
> `main` remains frozen and is not part of the release path.

## What is working

- General Contractor and Subcontractor workspace switcher
- Role-aware dashboards and marketplace navigation
- Project search and trade filtering
- GC project-posting workflow with immediate marketplace publication
- Subcontractor proposal workflow with submitted-state tracking
- Saved project interaction
- Qualified subcontractor directory
- In-app messaging with local conversation state
- Company profile and verification presentation
- Stripe-ready Pro subscription demonstration
- Responsive desktop, tablet, and mobile layouts

This branch intentionally uses deterministic in-memory demo data. It is presentation-ready without external credentials while the included Supabase schema and environment contract define the production integration path.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Production build:

```bash
npm run typecheck
npm run build
npm start
```

## Demo walkthrough

1. Start in the **GC** workspace and review the procurement dashboard.
2. Open **Projects & Talent**, search the talent directory, and switch to **My projects**.
3. Use **Post a project** and publish a new scope.
4. Switch to **Subcontractor** in the top role control.
5. Open **Find Work**, filter by trade, save a project, and submit a proposal.
6. Open **Messages** and send a message.
7. Open the company profile and activate the simulated **CrewUp Pro** plan.

## Production integration

The UI boundaries are ready to replace local state with server actions and repositories backed by Supabase:

- Supabase Auth for identity and role claims
- PostgreSQL + RLS for organizations, memberships, projects, proposals, conversations, and messages
- Supabase Storage for project files, licenses, and insurance certificates
- Stripe Checkout + Customer Portal for subscriptions
- Stripe webhooks as the source of truth for paid feature access
- Vercel preview deployments for branch QA

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`supabase/schema.sql`](supabase/schema.sql).

## Production definition of done

- Separate development, staging, and production Supabase projects
- OAuth/email authentication and account recovery
- Row-level security test coverage for every tenant table
- Idempotent Stripe webhook processing and billing portal
- Signed file uploads with type/size validation
- Email delivery, rate limiting, audit logs, monitoring, and error tracking
- End-to-end tests for signup, project publication, proposal, award, message, and subscription flows
- Legal, privacy, terms, moderation, and trust/safety workflows
- Verified production domain, transactional email domain, backups, and rollback runbook
