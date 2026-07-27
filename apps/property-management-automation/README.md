# PropertyFlow AI — Property Management Automation Demo

A production-minded, independently deployable demo for property-management maintenance operations. It centralizes requests from residents and staff, classifies urgency, routes work, tracks SLA risk, drafts resident updates, and advances work through a visible lifecycle.

## Demo story

1. Select a provider strategy: premium simulation, live provider chain, free-first, or local.
2. Submit a maintenance request from the intake panel.
3. The AI layer assigns emergency, urgent, or routine priority with confidence, rationale, SLA, and provider telemetry.
4. The request is routed to the appropriate vendor team.
5. An SLA deadline, resident message, approval flag, provider audit event, and workflow timeline are generated.
6. Operations staff can filter requests, inspect token/cost/latency metadata, see fallback attempts, and advance workflow state.

The demo uses synthetic data. It works with no keys, can call any configured OpenAI-compatible endpoint, and always retains a deterministic offline fallback.

## Provider modes

- `simulated-paid`: presentation-safe premium provider simulation with realistic model, token, latency, and estimated-cost telemetry. No network call.
- `auto`: paid endpoint first, free endpoint second, deterministic local engine last.
- `free-first`: free endpoint first, paid endpoint second, deterministic local engine last.
- `local`: deterministic rules only.

The selected mode can be changed directly in the UI for each request.

## Configure a free API fallback

Set these environment variables in Render or `.env`:

```bash
FREE_AI_BASE_URL=https://your-openai-compatible-provider.example/v1
FREE_AI_API_KEY=your-key
FREE_AI_MODEL=your-provider-model-id
FREE_AI_LABEL=Free-Tier OpenAI-Compatible API
```

Use the provider's API base URL **without** `/chat/completions`; the app appends that path automatically.

Set `AI_PROVIDER_MODE=auto` to prefer a configured paid provider and fall back to free, or `AI_PROVIDER_MODE=free-first` to try the free provider first. Even if the free service times out, rejects the request, or has no remaining quota, intake continues through the local engine.

Optional paid provider variables use the same contract:

```bash
PAID_AI_BASE_URL=https://your-paid-provider.example/v1
PAID_AI_API_KEY=your-key
PAID_AI_MODEL=your-model-id
PAID_AI_LABEL=Paid OpenAI-Compatible API
```

Do not expose keys in client-side code. All provider calls are made by the Node server.

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

Tests cover local triage, provider-supplied structured output, premium simulation, unconfigured-provider fallback, configured free-compatible responses, and secret-safe provider status.

## API

- `GET /api/health`
- `GET /api/providers`
- `GET /api/dashboard`
- `POST /api/requests`
- `POST /api/requests/:id/advance`
- `POST /api/reset`

## Deploy independently

### Render

Create a new Blueprint from the repository and point Render to this branch's `apps/property-management-automation/render.yaml`, or create a Web Service with:

- Branch: `agent/property-management-automation`
- Root directory: `apps/property-management-automation`
- Runtime: Docker
- Dockerfile path: `./Dockerfile`
- Health check: `/api/health`

No API variables are required for the default premium simulation. Add the `FREE_AI_*` variables only when you are ready to connect a free-compatible provider.

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
- Queue-backed retries, circuit breakers, and escalation timers
- Provider-specific adapters, structured-output validation, and cost budgets
- Audit logs, role permissions, and portfolio-level reporting
