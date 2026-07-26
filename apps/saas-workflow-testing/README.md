# FlowGuard QA — SaaS Code Review & Workflow Testing Demo

An independently deployable reliability cockpit for a multi-tenant, white-label SaaS workflow platform. It demonstrates how to test workflow creation, triggers, branching, actions, SLA timers, retries, idempotency, permissions, tenant isolation, observability, failure recovery, and AI-assisted release review.

## Demo story

1. Select a workflow and tenant fixture.
2. Choose a baseline execution or inject a realistic fault.
3. Choose a review provider strategy: premium simulation, live provider chain, free-first, or local.
4. Run the ten-check reliability suite.
5. Inspect weighted reliability score, evidence for every check, prioritized findings, remediation guidance, and execution trace.
6. Review the AI-generated executive summary, release decision, business impact, likely root cause, repair order, provider telemetry, and fallback path.

The deterministic test engine is intentionally reliable for client demonstrations. The AI review layer can simulate a premium provider, call any configured OpenAI-compatible endpoint, or fall back locally without losing the technical evidence.

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
- Executive release decision and business-risk translation
- Provider latency, token, cost, and fallback telemetry

## Review provider modes

- `simulated-paid`: premium engineering-review simulation with realistic model, token, latency, and estimated-cost metadata. No network call.
- `auto`: paid endpoint first, free endpoint second, deterministic local review last.
- `free-first`: free endpoint first, paid endpoint second, deterministic local review last.
- `local`: deterministic evidence-to-review transformation only.

The review strategy can be changed from the UI for every suite execution.

## Configure a free API fallback

Add these environment variables in Render or `.env`:

```bash
FREE_AI_BASE_URL=https://your-openai-compatible-provider.example/v1
FREE_AI_API_KEY=your-key
FREE_AI_MODEL=your-provider-model-id
FREE_AI_LABEL=Free-Tier OpenAI-Compatible Review API
```

Use the provider base URL **without** `/chat/completions`; the server appends that path.

Set:

```bash
REVIEW_PROVIDER_MODE=free-first
```

to prioritize the free provider, or use `REVIEW_PROVIDER_MODE=auto` to attempt a paid provider first. If the provider times out, rejects the request, or reaches quota, FlowGuard still generates a deterministic local review and preserves the complete test evidence.

Optional paid provider variables use the same contract:

```bash
PAID_AI_BASE_URL=https://your-paid-provider.example/v1
PAID_AI_API_KEY=your-key
PAID_AI_MODEL=your-model-id
PAID_AI_LABEL=Paid OpenAI-Compatible Review API
```

Provider keys are only read by the Node server and are never included in `/api/providers` responses or browser code.

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

Tests cover workflow failures, security severity, premium review simulation, local fallback, free-compatible provider output validation, and secret-safe status reporting.

## API

- `GET /api/health`
- `GET /api/providers`
- `GET /api/overview`
- `POST /api/test-runs`
- `GET /api/test-runs/:id`
- `POST /api/reset`

## Deploy independently

### Render

Use `apps/saas-workflow-testing/render.yaml`, or create a Docker Web Service with:

- Branch: `agent/saas-workflow-testing`
- Root directory: `apps/saas-workflow-testing`
- Runtime: Docker
- Dockerfile path: `./Dockerfile`
- Health check: `/api/health`

No API variables are required for premium simulation. Add the `FREE_AI_*` variables only when connecting a live compatible provider.

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
- Provider circuit breakers, budgets, and response caching
- SARIF/JSON/Markdown review report export
- CI quality gates based on severity and reliability score
