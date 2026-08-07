# Paid-Order Webhook Contract v1

## Endpoint

`POST /api/v1/webhooks/wordpress/paid-orders`

The backend accepts only `Content-Type: application/json` and signs the exact raw bytes sent over HTTP.

## Required headers

```http
Content-Type: application/json
X-Webhook-Key-Id: wordpress-primary-2026
X-Webhook-Timestamp: 1786075200
X-Webhook-Nonce: 2d82242d-4e77-45f0-b09f-57c72ba63e77
X-Webhook-Signature: sha256=<64 lowercase hex chars>
X-Idempotency-Key: wc-order-18492-paid
```

## Canonical signing input

```text
<timestamp>.<nonce>.<raw request body bytes>
```

Signature:

```text
hex(HMAC-SHA256(webhook_secret, canonical_input))
```

Send as:

```text
sha256=<hex digest>
```

Do not parse and re-serialize JSON after signing. The backend verifies the exact received bytes.

## Verification order

1. Record the inbound attempt.
2. Validate required headers.
3. Validate timestamp window.
4. Resolve key by `X-Webhook-Key-Id`.
5. Verify HMAC with constant-time comparison.
6. Claim nonce for replay protection.
7. Parse JSON.
8. Validate payload field-by-field.
9. Compare backend word/segment calculation with website-declared values.
10. Atomically create or return the existing job.

## Timestamp and replay rules

Default timestamp tolerance: ±300 seconds.

Default nonce retention: 900 seconds.

A repeated nonce inside the replay window is refused even if its HMAC is valid.

## Idempotency

A normal WooCommerce retry must reuse the same logical `X-Idempotency-Key` for the same paid order. A safely repeated logical order may use a fresh nonce/signature while keeping the same idempotency key.

The backend also protects uniqueness using:

- external order ID
- payment reference
- event ID
- idempotency key
- PostgreSQL constraints and transaction locks

Expected duplicate result: one order, one job, one logical segment set, one logical asset set, multiple webhook-attempt records.

## Responses

### New accepted order — 201

```json
{
  "success": true,
  "requestId": "req-id",
  "orderId": "uuid",
  "jobId": "uuid",
  "publicJobNumber": "JOB-20260807-ABC12345",
  "status": "accepted",
  "duplicate": false
}
```

### Safe duplicate — 200

Same shape with `"duplicate": true` and the existing IDs.

### Invalid payload — 422

```json
{
  "success": false,
  "requestId": "req-id",
  "error": {
    "code": "PAYLOAD_VALIDATION_FAILED",
    "message": "One or more fields are invalid.",
    "fields": [
      {
        "path": "customer.email",
        "code": "invalid_string",
        "message": "Invalid email"
      }
    ]
  }
}
```

### Status matrix

| Condition | Status | Retry automatically? |
|---|---:|---|
| Accepted new order | 201 | No |
| Safe duplicate | 200 | No |
| Missing/invalid security headers | 400 | No |
| Bad/unknown HMAC key | 401 | No |
| Expired timestamp | 401 | No; create a fresh signed attempt if appropriate |
| Replayed nonce | 409 | No; create a fresh nonce/signature only for a legitimate retry |
| Idempotency conflict | 409 | No; investigate contract mismatch |
| Invalid payload / parity failure | 422 | No; correct payload |
| Temporary backend failure | 503 | Yes, with backoff |
| Timeout/gateway failure | 408/502/504 | Yes, with backoff |
| Rate limited | 429 | Yes, honor retry guidance |

## Retry recommendation

For transient failures: exponential backoff with jitter, e.g. 5s, 15s, 45s, 2m, 5m, then surface an operational alert. Each network retry must use a fresh timestamp and nonce/signature but the same logical idempotency key and order identifiers.

## Payload

Canonical JSON Schema: `docs/paid-order.schema.json`

Synthetic example: `docs/examples/valid-paid-order.json`

Application validation additionally enforces total arithmetic and website/backend word/segment parity. Catalogue membership rules remain blocked until the authoritative client packet is supplied.
