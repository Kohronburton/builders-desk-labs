# FlowGuard QA — SaaS Code Review & Workflow Testing Demo

An independently deployable reliability cockpit for a multi-tenant, white-label SaaS workflow platform. It demonstrates how to test workflow creation, triggers, branching, actions, SLA timers, retries, idempotency, permissions, tenant isolation, observability, and failure recovery.

## Demo story

1. Select a workflow and tenant fixture.
2. Choose a baseline execution or inject a realistic fault.
3. Run the ten-check reliability suite.
4. Inspect weighted reliability score, evidence for every check, prioritized findings, remediation guidance, and execution trace.
5. Repeat with tenant bypass, duplicate delivery, timeout, latency, or branch-regression scenarios.

The deterministic engine is intentionally reliable for client demonstrations. It models the same validation layers that would be pointed at a real frontend, API, database, queue, Redis layer, container infrastructure, and third-party integrations.

## Coverage

- Workflow schema and trigger contracts
- Decision-branch outcome validation
- UI/API/output consistency
- SLA timer lifecycle
- Retry/backoff and dead-letter behavior
- Idempotency and duplicate delivery
- Tenant-scoped authorization
- Role/permission matrix
- Tenant-aware structured logging
- Fault injection and prioritized remediation report

## Run locally

```bash
cd apps/saas-workflow-testing
npm start
```

Open `http://localhost:3000`.

## Test

```bash
npm test
```

## API

- `GET /api/health`
- `GET /api/overview`
- `POST /api/test-runs`
- `GET /api/test-runs/:id`
- `POST /api/reset`

## Deploy independently

### Render

Use `apps/saas-workflow-testing/render.yaml`, or create a Docker Web Service with:

- Root directory: `apps/saas-workflow-testing`
- Health check: `/api/health`

### Docker

```bash
docker build -t flowguard-qa apps/saas-workflow-testing
docker run --rm -p 3000:3000 flowguard-qa
```

## Production extension points

- Playwright browser suites and API contract tests
- PostgreSQL tenant fixtures and cross-tenant probes
- Redis/queue fault injection and retry observation
- OpenTelemetry traces and log correlation
- Docker Compose integration environment
- k6 noisy-neighbor and database-contention load tests
- SARIF/JSON/Markdown review report export
- CI quality gates based on severity and reliability score
