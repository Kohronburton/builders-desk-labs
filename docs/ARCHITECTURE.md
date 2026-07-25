# Architecture

## Components

### n8n orchestration
Owns webhook ingress, envelope normalization, workflow-level retries, response routing, and global error capture. Business reliability rules remain in the engine so they can be tested outside the visual editor.

### Workflow reliability engine
A typed Node 22 service with no runtime npm dependencies. It owns runtime validation, idempotency, diagnostic retries, AI-provider selection, structured-output validation, persistence, metrics, and MCP tools.

### SQLite audit store
Provides a durable execution ledger and unique `request_id` constraint. WAL mode supports concurrent readers while the single demo service writes.

### AI provider abstraction
Deterministic mode produces reproducible results without credentials. OpenAI mode uses the same validated output contract.

### Diagnostic API
A controlled fault-injection endpoint simulates timeout, rate limit, recovery, and permanent outage behavior.

## Request flow
1. n8n receives a webhook and normalizes the envelope.
2. The engine validates `requestId`, `sessionId`, `message`, and `scenario`.
3. The repository inserts a unique processing record.
4. Diagnostics run with timeout and bounded retry.
5. The AI provider generates a decision.
6. The decision is parsed and validated. Malformed output is retried.
7. The completed result is persisted and returned.
8. Repeated request IDs return the persisted result with `duplicate=true`.

## Failure boundaries
- Validation failures return HTTP 400 and never start an execution.
- Concurrent duplicate work returns HTTP 409.
- Retryable HTTP failures include 429 and 5xx.
- Timeout is converted to retryable HTTP 504.
- Terminal failures are persisted before HTTP 500 is returned.
- n8n-level errors are forwarded to the global error endpoint.

## Scalability path
For production, replace SQLite with PostgreSQL, use Redis or a database advisory lock for distributed idempotency, add tenant-aware authorization, externalize metrics, and pin the n8n image after compatibility testing.
