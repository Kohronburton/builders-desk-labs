# Runbook

## Start
```bash
cp .env.example .env
docker compose up --build -d
docker compose ps
```

## Import workflows
```bash
./scripts/import-workflows.sh
```
Open n8n, inspect credentials and URLs, then activate the workflows.

## Verify
```bash
curl -s http://localhost:3000/health
curl -s http://localhost:3000/metrics
./scripts/smoke-test.sh
```

## Common incidents

### n8n cannot reach the engine
- Confirm `workflow-engine` is healthy in `docker compose ps`.
- Confirm the HTTP Request node uses `http://workflow-engine:3000`, not `localhost`.
- Inspect `docker compose logs workflow-engine`.

### Timeout scenario never recovers
- Confirm `MOCK_TIMEOUT_MS` is greater than `DIAGNOSTICS_TIMEOUT_MS`.
- Use a fresh `requestId`; completed and failed request IDs are idempotent.

### OpenAI mode fails immediately
- Confirm `AI_MODE=openai` and `OPENAI_API_KEY` are set in `.env`.
- Review status codes in engine logs.
- Switch to deterministic mode to isolate provider credentials from workflow logic.

### Duplicate returns unexpected old output
This is expected idempotent behavior. Generate a new request ID for a fresh execution.

## Backup
The execution database is in the `workflow_data` Docker volume. For a demo reset:
```bash
docker compose down -v
```
This deletes n8n and execution data.

## Rollback
Stop the feature stack with `docker compose down`. The demo is branch-isolated and does not alter the repository’s main application spine.
