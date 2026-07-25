# AI Workflow Reliability Lab

A fully working, portfolio-grade demo for troubleshooting and hardening AI-powered n8n automations. It demonstrates the engineering work behind reliable AI workflows rather than a basic chatbot.

## What it proves

- Importable **n8n** support-triage and global error workflows
- Strict request validation and structured AI-output enforcement
- Retry with exponential backoff for timeouts, rate limits, malformed LLM output, and transient failures
- Idempotent request handling that prevents duplicate downstream work
- Persistent SQLite execution audit trail
- Deterministic no-key mode plus optional live OpenAI mode
- Minimal MCP JSON-RPC tool surface (`initialize`, `tools/list`, `tools/call`)
- Prometheus-style metrics and health checks
- Browser-based live demo console
- Automated unit/integration tests and GitHub Actions CI

## Architecture

```mermaid
flowchart LR
  U[Client / Demo Console] -->|POST webhook| N[n8n workflow]
  N -->|validated JSON| E[Workflow Reliability Engine]
  E --> D[Diagnostic API]
  E --> A[Deterministic or OpenAI provider]
  E --> S[(SQLite audit + idempotency)]
  E --> M[/metrics]
  MCP[MCP client] -->|JSON-RPC tools/call| E
  N -. failure event .-> H[Global error workflow]
  H --> S
```

## Start locally

```bash
cp .env.example .env
docker compose up --build -d
```

Open:

- Demo console: http://localhost:3000
- n8n: http://localhost:5678
- Health: http://localhost:3000/health
- Metrics: http://localhost:3000/metrics

Import the n8n workflows:

```bash
./scripts/import-workflows.sh
```

Review and activate **AI Workflow Reliability - Support Triage** in n8n. Its production webhook path is:

```text
POST http://localhost:5678/webhook/ai-workflow-reliability
```

## Run without Docker

The workflow engine has zero npm runtime dependencies and uses Node 22 built-ins.

```bash
npm start
```

## Test scenarios

| Scenario | Expected behavior |
|---|---|
| `success` | One diagnostic attempt and one AI attempt |
| `timeout-once` | Diagnostic call times out, retries, and succeeds |
| `rate-limit-once` | Simulated HTTP 429, retries, and succeeds |
| `invalid-ai-once` | Invalid model JSON is rejected, retried, and repaired |
| `duplicate` | Same request ID returns the persisted result without re-running |
| `permanent-failure` | Retries exhaust and a controlled failed execution is persisted |

Run the smoke suite:

```bash
./scripts/smoke-test.sh
```

## Live OpenAI mode

```bash
AI_MODE=openai
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-4o-mini
```

Restart the workflow engine after changing the environment.

## Direct API example

```bash
curl -s http://localhost:3000/v1/workflows/support-triage \
  -H 'content-type: application/json' \
  -d @examples/timeout-recovery.json
```

## MCP example

```bash
curl -s http://localhost:3000/mcp \
  -H 'content-type: application/json' \
  -d @examples/mcp-tools-list.json
```

## Quality checks

```bash
npm run ci
```

See `docs/` for the product brief, architecture, sprint backlog, runbook, test plan, security review, demo script, and ADRs.
