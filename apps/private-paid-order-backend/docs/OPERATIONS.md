# Operations Guide

## Daily operating model

The API receives/validates paid orders and serves the protected operator surface. The worker rehosts and expires customer assets. PostgreSQL is the durable system of record. Redis is used only for short-lived webhook nonce replay protection.

## Start locally

From `apps/private-paid-order-backend`:

```bash
docker compose up -d postgres redis minio minio-init
```

From the repository root:

```bash
pnpm install
pnpm --filter @builders-desk/private-paid-order-backend migrate
pnpm --filter @builders-desk/private-paid-order-backend dev
```

In another terminal:

```bash
pnpm --filter @builders-desk/private-paid-order-backend dev:worker
```

The `.env.example` values intentionally require generated keys/approved placeholders before startup.

## Create an operator

Set environment variables only for the command invocation:

```text
NEW_USER_EMAIL=operator@example.test
NEW_USER_PASSWORD=<strong unique password, 12+ chars>
NEW_USER_ROLE=OPERATOR
```

Then run:

```bash
pnpm --filter @builders-desk/private-paid-order-backend user:create
```

The command refuses duplicate users instead of silently replacing credentials.

## Migrations

```bash
pnpm --filter @builders-desk/private-paid-order-backend migrate
```

Migrations are ordered files under `db/migrations`. The migration runner records SHA-256 checksums. Re-running unchanged migrations is safe. If an already-applied migration file changes, migration execution stops—create a new numbered migration instead.

## Health

- `/health/live` — process liveness
- `/health/ready` — PostgreSQL + Redis + private storage readiness

If readiness is 503, do not continue sending paid orders until the failing dependency is restored.

## Webhook investigation

Look up the request by backend `requestId`, external order ID, or idempotency key in `app.webhook_attempts`.

Safe failure classes include:

- `BAD_HEADERS`
- `UNKNOWN_KEY`
- `BAD_SIGNATURE`
- `EXPIRED_TIMESTAMP`
- `REPLAYED_NONCE`
- `PAYLOAD_VALIDATION_FAILED`
- `PRICING_PARITY_FAILED`
- `IDEMPOTENCY_CONFLICT`
- `ORDER_ACCEPT_FAILED`

Never paste production secrets or customer media into issue trackers/log channels while debugging.

## Asset ingestion investigation

`app.uploaded_assets.ingestion_status` states:

- `PENDING`
- `IN_PROGRESS`
- `RETRY`
- `READY`
- `FAILED`
- `DELETING`
- `DELETED`

Review `attempt_count`, `last_error_code`, `next_attempt_at`, and lease fields. A crashed worker's lease expires and another worker may reclaim the row. Permanent failures stop after `ASSET_WORKER_MAX_ATTEMPTS` and require operator/developer review.

After successful rehosting, `source_url_encrypted` is set to NULL. Production should then be independent of the temporary WordPress URL.

## Operator access

- `/operator/login` — human login
- `/operator` — job list
- `/operator/jobs/:jobId` — safe job detail, segments, private assets, status action

Operators cannot browse the `internal` proprietary schema through the application. Private-file access uses expiring signed links and is audited.

## Key rotation

1. generate a new strong webhook secret and key ID
2. configure as secondary backend key
3. configure WordPress to sign with the new key ID/secret
4. send staging/synthetic paid order and confirm acceptance
5. promote new key to primary configuration
6. keep old key briefly during controlled overlap
7. remove old key after delivery logs confirm no old-key traffic
8. record the rotation operationally

Never reuse the data-encryption or audit-hash keys as webhook secrets.

## Incident: webhook intake unavailable

1. check `/health/ready`
2. check database and Redis connectivity
3. verify migrations are current
4. keep WordPress retries queued/persisted rather than dropping orders
5. recover service
6. replay legitimate queued deliveries with fresh timestamps/nonces but original order/idempotency identifiers
7. verify exactly one backend job per order

## Incident: object storage unavailable

Paid-order intake can still create the job/asset placeholders only if the API readiness policy allows it. Current production composition treats private storage as readiness-critical, so routing should pause while storage is unavailable. Existing PENDING/RETRY asset rows remain durable in PostgreSQL.

## Incident: suspected secret exposure

- webhook secret: rotate key immediately
- storage credentials: revoke/replace at provider and redeploy
- DB/Redis credential: rotate and verify service connectivity
- data-encryption key: treat as sensitive recovery event because existing encrypted temporary URLs require that key until ingestion completes
- operator password/session: disable/reset user; revoke sessions as needed

## Clean shutdown

API and worker handle SIGTERM/SIGINT. Deploy platforms should allow a termination grace window so active work can finish/lease safely.
