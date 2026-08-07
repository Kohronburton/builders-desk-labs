# Deployment Guide

## Production shape

Keep Phase 1 small:

- **API service** — one container, command `node dist/server.js`
- **asset worker** — same image, command `node dist/worker.js`
- **PostgreSQL** — managed/private network preferred
- **Redis** — managed/private network preferred; replay nonce store only
- **S3-compatible private bucket** — public access disabled
- **TLS/domain** — API/operator endpoint behind HTTPS

Do not split business modules into separate microservices in Phase 1.

## Required accounts / services

No commercial software licence is required by the code itself. The client needs infrastructure accounts for:

1. source repository / CI (GitHub or equivalent)
2. container hosting for API and worker
3. PostgreSQL
4. Redis
5. S3-compatible private object storage
6. DNS/TLS
7. optional error/metrics provider

Provider choice may be Render/Railway/DigitalOcean/AWS/etc.; the application contract does not depend on one vendor.

## Separate database identities

Use two database credentials in production:

- **migration owner** — used only by deployment/ops to run schema migrations
- **runtime user** — used by API/worker; does not own schemas and has no access to `internal`

Apply `docs/runtime-grants.sql` with the real runtime role. Never set the application `DATABASE_URL` to the schema-owner credential after deployment.

## Secrets

Store in provider secrets, never repository/environment files committed to Git:

- `DATABASE_URL`
- `REDIS_URL`
- `DATA_ENCRYPTION_KEY_B64`
- `AUDIT_HASH_KEY_B64`
- webhook HMAC key(s)
- object-storage credentials

Generate data/audit keys independently. Keep staging and production secrets completely separate.

## Pre-deploy gate

Before first production traffic:

- all `PLACEHOLDER` items resolved
- `BUSINESS_RULES_APPROVED=true`
- production catalogue seeded/approved
- segmentation parity fixtures pass against website logic
- real WordPress upload hostname tested
- runtime DB proprietary-denial test passed
- backup created and restored successfully
- baseline/burst/duplicate-storm tests passed in staging
- WordPress staging webhook acceptance checklist passed

## Deploy sequence

1. Build/test the commit in CI.
2. Create/verify PostgreSQL, Redis, and private object storage.
3. Apply migrations using migration-owner credentials.
4. Apply least-privilege runtime grants.
5. Configure API/worker secrets using runtime credentials.
6. Deploy API container.
7. Verify `/health/live` and `/health/ready`.
8. Deploy worker container using the same application image with worker command.
9. Verify worker startup and private-storage health.
10. Create initial operator using the controlled bootstrap command.
11. Run the signed webhook simulator against staging/production test route only as approved.
12. Coordinate WordPress staging webhook tests.
13. Enable real paid-order delivery only after acceptance evidence is recorded.

## Health behavior

`GET /health/live` proves the process is alive.

`GET /health/ready` checks PostgreSQL, Redis, and private object storage. A failed critical dependency returns 503 so a platform/load balancer can stop routing new traffic.

## Rollback

Application rollback:

1. stop new deployment / route traffic to last known-good image
2. keep worker compatible with current database schema or pause it if necessary
3. verify readiness
4. run a synthetic signed order before reopening paid traffic

Database migrations in Phase 1 are forward migrations. Do not automatically reverse a production migration containing real order data. If schema/data recovery is required, use the documented backup/restore process in a controlled recovery environment.

## Scaling

Scale API instances horizontally only after Redis and PostgreSQL are shared/managed and the load test proves database headroom. Webhook idempotency and advisory locks are database-backed, so multiple API instances remain safe.

Scale asset workers horizontally; `FOR UPDATE SKIP LOCKED` leases ensure a row is claimed by one worker at a time. Keep worker concurrency conservative until storage/network limits are measured.
