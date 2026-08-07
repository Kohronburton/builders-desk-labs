# Load and High-Traffic Test Plan

The paid-order endpoint is intentionally small and transactional. Files are rehosted asynchronously by the worker, so webhook latency is not tied to upload size.

## Runner

```bash
LOAD_TEST_URL=https://staging.example.test/api/v1/webhooks/wordpress/paid-orders \
LOAD_TEST_KEY_ID=<staging-key-id> \
LOAD_TEST_SECRET=<staging-secret> \
LOAD_TEST_MODE=baseline \
pnpm --filter @builders-desk/private-paid-order-backend load:test
```

The runner refuses `NODE_ENV=production` unless `ALLOW_PRODUCTION_LOAD_TEST=true` is deliberately set.

## Profiles

| Mode | Default traffic | Purpose |
|---|---:|---|
| `baseline` | 5 requests/sec × 20 sec | Normal sustained intake |
| `burst` | 25 requests/sec × 10 sec | Short checkout/payment burst |
| `stress` | 50 requests/sec × 10 sec | Find capacity headroom; informational until infrastructure sizing is approved |
| `duplicate` | 100 concurrent logical duplicates | Prove idempotency under a retry storm |

`LOAD_TEST_RPS` and `LOAD_TEST_SECONDS` can override baseline/burst/stress values for staging capacity work.

## Correctness gates

For baseline/burst valid unique orders:

- 100% 2xx responses
- one unique job per logical order
- no 401/409/422 caused by the backend-generated valid fixture
- no 5xx responses
- no database uniqueness/transaction errors
- webhook attempt count equals delivery count

For duplicate storm:

- exactly one `201 Created`
- exactly ninety-nine `200 OK`
- all 100 responses identify the same `jobId`
- database contains one logical order/job/segment set
- database contains 100 webhook-attempt records for the deliveries

## Initial latency targets

These are engineering targets for staging, not a contractual SLA:

- baseline p95 ≤ 500 ms
- burst p95 ≤ 1000 ms
- no request exceeds the configured HTTP timeout under baseline/burst
- stress results are recorded to size production; stress is not automatically a release blocker until expected traffic is agreed

If the environment cannot meet the initial target, investigate before increasing instances blindly. Check:

- PostgreSQL transaction/lock latency
- connection-pool saturation
- Redis latency
- API CPU/memory
- webhook-attempt write indexes
- duplicate/advisory lock contention
- platform network latency

## Worker traffic test

Webhook load does not prove asset throughput. Test the worker separately using synthetic files from the approved staging WordPress hostname:

- small image mix
- maximum allowed size
- multiple jobs/assets
- storage outage/recovery
- download timeout
- invalid MIME/extension
- expired lease/reclaim
- retention delete/retry

Record ingestion rate and queue age. Scale worker instances only after confirming `SKIP LOCKED` behavior and object-storage limits.

## Evidence to retain

For each release candidate, retain:

- commit SHA
- environment/config class (never secrets)
- mode/RPS/duration
- request/status counts
- p50/p95/p99/max latency
- duplicate-storm job-ID count
- PostgreSQL/Redis resource observations
- pass/fail and follow-up issue links

Do not run high-volume tests against live paid traffic without an approved test window.
