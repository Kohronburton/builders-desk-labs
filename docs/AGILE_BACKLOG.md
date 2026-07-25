# Agile Backlog

## Epic E1 — Reliable AI workflow trial demo

### Story S1 — Reproducible local environment
**As an evaluator, I want one-command startup so I can review the demo quickly.**

Acceptance criteria:
- Docker Compose starts n8n and the workflow engine.
- Deterministic mode requires no paid credential.
- Health checks block n8n until the engine is ready.

### Story S2 — Safe webhook processing
**As an operator, I want malformed requests rejected before side effects.**

Acceptance criteria:
- Required fields are validated at runtime.
- Request bodies are capped at 1 MB.
- Errors use stable codes and controlled HTTP responses.

### Story S3 — Failure recovery
**As an operator, I want transient failures retried without duplicating work.**

Acceptance criteria:
- Timeout and 429 scenarios recover.
- Retry attempts are bounded and observable.
- Reusing a request ID returns the stored result.

### Story S4 — Trustworthy AI output
**As a downstream system, I want AI output validated before use.**

Acceptance criteria:
- Invalid JSON is rejected.
- Invalid output triggers a corrective retry.
- Only the documented schema is persisted and returned.

### Story S5 — Operational visibility
**As a maintainer, I want an audit trail and metrics for troubleshooting.**

Acceptance criteria:
- Success and failure records are persisted.
- Recent executions are visible in the browser.
- Health and Prometheus-style metrics endpoints are available.

### Story S6 — Portfolio delivery
**As a client, I want complete documentation and test evidence.**

Acceptance criteria:
- Architecture, ADR, runbook, test plan, security review, and demo script exist.
- CI runs JSON workflow checks and automated tests.
- Work is delivered through a feature branch and pull request.

## Future backlog
- PostgreSQL and Redis production adapters
- OAuth/tenant isolation
- Native n8n MCP Client Tool variant
- OpenTelemetry traces
- Dead-letter reprocessing UI
