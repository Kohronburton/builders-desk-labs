# Private Paid-Order Backend — V2 Technical Specification

## Purpose

Build the private Phase 1 backend that begins **after successful WordPress/WooCommerce payment**.

The system has one core guarantee:

> A valid signed paid-order delivery creates exactly one production job with validated linked records and private assets. Forged, replayed, conflicting, or invalid deliveries create no production job.

This is a separate backend service. It is not a WordPress plugin, and WordPress does not browse/query private production data.

## Phase 1 only

### Included

- signed paid-order webhook
- HMAC verification and key rotation overlap
- timestamp window and replay protection
- idempotency and concurrent duplicate protection
- immediate webhook-attempt recording
- strict field-level validation and actionable errors
- approved catalogue/selection validation
- website/backend word + segment parity gate
- customer/order/consent/script/job/segment records
- private upload rehosting
- sensitive-file retention lifecycle
- protected operator/admin view
- job status/history and audit trail
- protected proprietary-data boundary
- health/readiness
- WordPress contract + simulator
- migrations, backup, restore, load tests, deployment/operations documentation

### Explicitly excluded

- Grok
- OpenAI
- ElevenLabs
- automatic Director Module
- AI/video generation
- final assembly
- final delivery routing
- customer portal
- advanced analytics
- complex multi-operator RBAC
- full production automation

## Simple production shape

```text
WordPress/WooCommerce
        |
        | signed paid-order webhook
        v
API service -------------------- Operator UI/API
   |                                  |
   | atomic validated records         | safe projection only
   v                                  v
PostgreSQL <----- asset worker ---- private object storage
   |
Redis nonce/replay protection

internal proprietary schema
  └── denied to normal runtime/operator database identity
```

Phase 1 is a **modular monolith**, not a collection of microservices:

- one API deployment
- one worker deployment
- one PostgreSQL database
- one Redis instance
- one private S3-compatible bucket

Mayne supplies shared configuration/logging/health/testing/module standards. This product keeps its own Order, ProductionJob, ScriptSegment, UploadedAsset, WebhookAttempt, and operator workflow domain.

## Technology

- TypeScript / Node.js 22
- Fastify
- Zod
- PostgreSQL 16+
- Redis
- S3-compatible private object storage
- server-rendered operator panel + protected JSON API
- esbuild production bundles
- Docker
- GitHub Actions

### Why this is tighter than a heavier stack

Fastify + Zod keep the public attack surface small and explicit. PostgreSQL owns transactions, idempotency, status history, audit records, and the durable asset work queue. Redis has one narrow responsibility: short-lived nonce replay protection. The operator panel avoids a separate SPA/auth stack in Phase 1.

## Paid-order contract

Endpoint:

```http
POST /api/v1/webhooks/wordpress/paid-orders
```

Required headers:

```http
X-Webhook-Key-Id
X-Webhook-Timestamp
X-Webhook-Nonce
X-Webhook-Signature
X-Idempotency-Key
```

Canonical signature input:

```text
<timestamp>.<nonce>.<exact raw JSON bytes>
```

Signature:

```text
sha256=<hex(HMAC-SHA256(secret, canonical input))>
```

Verification order:

1. record attempt
2. validate security headers
3. validate timestamp
4. resolve key ID
5. verify constant-time HMAC
6. claim nonce
7. parse/validate payload
8. validate catalogue selections
9. verify word/segment parity
10. atomically create or return the existing job

A safe network retry uses a fresh timestamp/nonce/signature but keeps the same logical order/event/idempotency identifiers and **the same paid-order content**. Reusing an idempotency key for changed content is a conflict.

## Private file lifecycle

```text
temporary WordPress URL
        |
        | HTTPS + exact host allow-list
        | no redirects / IP literals / URL credentials
        | timeout + byte limit
        v
content detection + MIME/extension/size verification
        |
        | SHA-256
        v
random private storage key
        |
        | original WordPress URL cleared after success
        v
short-lived audited operator access
        |
        v
30 / 60 / 90 day retention cleanup
```

Failed ingestion is durable, leased, retryable, and crash-recoverable through PostgreSQL. A failed retention delete returns to a retryable state.

## Operator boundary

Operators receive only production-needed fields:

- job/order identifiers
- required customer metadata
- package/template/style/voice/product codes
- script and segments
- safe asset metadata + expiring access
- job status/history

Operators do **not** receive:

- webhook/storage/database secrets
- internal prompts
- Director Module text
- private style-pack contents
- internal mappings
- model/provider credentials
- unrestricted database rows

Protection exists at two levels:

1. explicit application projections
2. separate `internal` schema denied to the normal runtime database role

## Operator authentication

Phase 1 uses simple server-side authentication:

- scrypt password hashes
- generic login failures
- login rate limiting + failed-attempt lockout
- random opaque session tokens; only hashes stored server-side
- expiry/revocation
- production Secure/HttpOnly/SameSite cookies
- independent CSRF token for state-changing actions
- audited login/logout/status/file-link actions

## Data integrity

PostgreSQL transactions and constraints enforce:

- one logical paid order/job
- unique external order/payment/event/idempotency identifiers
- all-or-nothing linked record creation
- deterministic segment order
- status-history append records
- payload-bound duplicate semantics
- migration checksum integrity

## Acceptance behavior

| Case | Expected result |
|---|---|
| Valid paid order | 201, one job |
| Safe logical duplicate | 200, same job |
| Same idempotency key + changed content | 409 |
| Bad/altered HMAC | 401, no job |
| Expired timestamp | 401, no job |
| Replayed nonce | 409, no second job |
| Invalid field | 422 + exact field error |
| Unknown/disallowed catalogue code | 422 |
| Website/backend segment mismatch | 422 |
| Rehosted file | private object; WP URL no longer required |
| Anonymous operator | denied |
| Operator private asset | short-lived audited link |
| Operator proprietary-field request | no proprietary data exposed |
| Runtime DB reads `internal` | permission denied |
| Backup/restore drill | restored counts/schema + proprietary denial reverified |
| 100-way duplicate storm | exactly 1×201 + 99×200 + one job ID |

## Performance gates

Initial staging engineering targets, not contractual SLA:

- baseline: 5 paid orders/sec × 20 sec
- burst: 25/sec × 10 sec
- duplicate storm: 100 concurrent deliveries for one logical order
- stress sizing: 50/sec × 10 sec
- baseline p95 target ≤ 500 ms
- burst p95 target ≤ 1000 ms
- zero 5xx for valid baseline/burst traffic

File throughput is measured separately because file work is asynchronous.

## Agile implementation gates

### Phase 1 — Intake and data integrity

Done when HMAC/replay/idempotency/validation/parity/atomic job creation tests are green.

### Phase 2 — Private assets

Done when strict download, private storage, durable retries, signed access, and retention tests are green.

### Phase 3 — Operator boundary

Done when auth, CSRF, safe projections, status/history, signed asset access, and proprietary-denial tests are green.

### Phase 4 — WordPress handoff

Done when the real WordPress staging implementation can independently sign, send, diagnose, and safely retry synthetic paid orders.

### Phase 5 — Operations and traffic

Done when production bundle/container, migrations, DB denial, backup/restore, baseline/burst, and duplicate-storm evidence are green.

### Phase 6 — Client-rule release gate

Production-ready is blocked until authoritative client values replace every placeholder.

## Client values intentionally not guessed

- final package/template/style/voice/product catalogue and compatibility rules
- exact website word-count/segmentation algorithm + parity fixtures
- real WordPress upload hostname(s)
- approved sensitive-file retention policy
- production runtime database role/provider configuration

Synthetic placeholder catalogue data exists only for local/staging integration. Production configuration/readiness rejects unresolved placeholders.

## Handoff set

Repository documentation includes:

- JSON Schema
- OpenAPI contract
- valid synthetic payload
- webhook signing/error/retry contract
- PHP WordPress example
- simulator
- threat model
- deployment guide
- operations runbook
- backup/restore procedure
- runtime DB grants
- acceptance checklist
- load/high-traffic plan
- placeholder ledger
- gated implementation plan

## Commercial delivery structure

Recommended client-facing structure:

1. **Contract + secure intake** — payload/signing/schema + atomic job creation
2. **Private assets + segmentation** — rehosting, retention, parity
3. **Operator boundary** — login, safe views, status/history, private links
4. **Hardening + handoff** — staging WordPress test, recovery, load, deployment docs

The final fixed price/timeline should be committed only after the redacted developer packet confirms the segmentation/catalogue rules and expected infrastructure/traffic. The earlier planning range of roughly 6–8 weeks / 230–300 hours is intentionally a planning envelope rather than an unsupported promise.
