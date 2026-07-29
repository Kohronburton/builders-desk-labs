# Test Plan

## Automated tests
- Input defaults and validation errors
- Agent decision schema acceptance and rejection
- Diagnostic retry after transient 503
- AI corrective retry after invalid JSON
- Idempotent duplicate response without repeated providers
- Terminal failure persistence
- Health, workflow, execution lookup, and MCP endpoint integration
- n8n workflow JSON structural validation

Run:
```bash
npm run ci
```

## Manual acceptance matrix

| Test | Input | Expected |
|---|---|---|
| Happy path | `success` | HTTP 200; 1 diagnostic; 1 AI attempt |
| Timeout recovery | `timeout-once` | HTTP 200; diagnostics attempts > 1 |
| Rate-limit recovery | `rate-limit-once` | HTTP 200; diagnostics attempts > 1 |
| AI repair | `invalid-ai-once` | HTTP 200; AI attempts = 2 |
| Duplicate | same request ID twice | Second response has `duplicate=true` |
| Terminal outage | `permanent-failure` | HTTP 500; persisted status `failed` |
| Invalid input | missing message | HTTP 400; no execution row |
| MCP discovery | `tools/list` | Two tool definitions returned |

## Exit criteria
All automated tests pass and each manual row produces the documented behavior in deterministic mode.
