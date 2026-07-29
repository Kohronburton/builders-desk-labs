# Security Review

## Controls included
- Runtime validation on every external field
- 1 MB request-body limit
- No secrets committed to the repository
- Optional OpenAI key read only from environment
- Bound retries to prevent unbounded cost and loops
- Idempotency to prevent duplicate side effects
- Structured AI output validation before persistence or response
- Non-root Docker user
- Controlled error responses without internal stack traces

## Demo limitations
- No authentication or tenant isolation
- CORS is open for local review
- SQLite is local and unencrypted
- The MCP endpoint implements a minimal JSON-RPC tool surface rather than a full enterprise gateway
- The n8n image defaults to `latest`; pin a tested digest for production

## Production requirements
Add OAuth or signed webhooks, tenant-scoped authorization, secret manager integration, PostgreSQL/Redis, TLS, rate limiting, audit retention policy, SAST/dependency scans, image pinning, and centralized logs/traces.
