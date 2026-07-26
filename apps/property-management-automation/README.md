# PropertyFlow AI — Property Management Automation Demo

A production-minded, independently deployable demo for property-management maintenance operations. It centralizes requests from residents and staff, classifies urgency, routes work, tracks SLA risk, drafts resident updates, and advances work through a visible lifecycle.

## Demo story

1. Submit a maintenance request from the intake panel.
2. The rules-backed AI triage engine assigns emergency, urgent, or routine priority with a confidence score and rationale.
3. The request is routed to the appropriate vendor team.
4. An SLA deadline, resident message, approval flag, and audit timeline are generated.
5. Operations staff can filter requests, inspect automation details, and advance workflow state.

The demo uses synthetic data and runs without paid APIs or external services. The deterministic engine makes the portfolio demo reliable while leaving a clear seam for an LLM classifier, AppFolio/Yardi integration, messaging provider, database, or queue.

## Run locally

```bash
cd apps/property-management-automation
npm start
```

Open `http://localhost:3000`.

## Test

```bash
npm test
```

## API

- `GET /api/health`
- `GET /api/dashboard`
- `POST /api/requests`
- `POST /api/requests/:id/advance`
- `POST /api/reset`

## Deploy independently

### Render

Create a new Blueprint from the repository and point Render to this branch's `apps/property-management-automation/render.yaml`, or create a Web Service with:

- Root directory: `apps/property-management-automation`
- Runtime: Docker
- Health check: `/api/health`

### Docker

```bash
docker build -t propertyflow-ai apps/property-management-automation
docker run --rm -p 3000:3000 propertyflow-ai
```

## Production extension points

- PostgreSQL persistence and tenant-scoped row-level security
- Vendor directory, estimates, approvals, and scheduling
- SMS/email notifications with delivery tracking
- AppFolio, PropertyWare, or Yardi adapters
- Queue-backed retries and escalation timers
- LLM classification with structured-output validation and deterministic fallback
- Audit logs, role permissions, and portfolio-level reporting
