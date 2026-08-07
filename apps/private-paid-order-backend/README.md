# Private Paid-Order Backend — Mayne V2

A separate private backend for paid WordPress/WooCommerce orders. WordPress owns the public order/payment flow. This service starts only after successful payment.

## One rule

**A signed paid-order webhook creates exactly one valid production job, or it creates nothing.**

## Phase 1 scope

Included: signed webhook intake, replay/idempotency protection, structured order/job/segment records, private upload rehosting, operator-safe views, audit history, retention, health checks, backup/restore tooling, testing, and developer handoff.

Excluded: Grok, OpenAI, ElevenLabs, Director automation, AI/video generation, assembly, delivery routing, customer portal, advanced analytics, and full production automation.

## Architecture

```text
WordPress/WooCommerce
        |
        | signed paid-order webhook
        v
Fastify API -------------------- Operator UI/API
   |                                  |
   | atomic order/job creation        | safe projection only
   v                                  v
PostgreSQL <---- asset worker ---- private S3 storage
   |
Redis replay protection

internal.proprietary_content
  └── server-side only; never joined into operator views
```

This is a modular monolith: one API deployment, one worker deployment, one PostgreSQL database, one Redis instance, and one private S3-compatible bucket.

## Local quick start

1. Copy `.env.example` to `.env`.
2. Replace every required `PLACEHOLDER` used by local startup. Generate `DATA_ENCRYPTION_KEY_B64` and `AUDIT_HASH_KEY_B64` independently.
3. Start dependencies with `docker compose up -d postgres redis minio minio-init`.
4. Install: `pnpm install` from the repository root.
5. Migrate: `pnpm --filter @builders-desk/private-paid-order-backend migrate`.
6. Create an operator using environment variables described in `docs/OPERATIONS.md`.
7. Start API: `pnpm --filter @builders-desk/private-paid-order-backend dev`.
8. Start worker separately: `pnpm --filter @builders-desk/private-paid-order-backend dev:worker`.
9. Run a signed staging/local webhook: `pnpm --filter @builders-desk/private-paid-order-backend webhook:simulate`.
10. Sign in at `/operator/login`.

## Quality gate

```bash
pnpm --filter @builders-desk/private-paid-order-backend check
pnpm --filter @builders-desk/private-paid-order-backend build
pnpm validate:modules
```

CI runs these automatically.

## Production blockers

Production startup refuses unresolved `PLACEHOLDER` values and refuses `BUSINESS_RULES_APPROVED=false`.

The following remain intentionally unresolved until the client packet / WordPress developer supplies the authoritative rules:

- package/catalogue codes and compatibility rules
- exact website word-count and segmentation rules
- production WordPress upload hostnames
- final retention selection/policy

See `docs/PLACEHOLDERS.md`.

## Documentation

- `docs/WEBHOOK-CONTRACT.md` — signing, headers, responses, retries
- `docs/WORDPRESS-HANDOFF.md` — PHP example and staging workflow
- `docs/SECURITY.md` — trust boundaries and hardening
- `docs/DEPLOYMENT.md` — environments and accounts
- `docs/OPERATIONS.md` — migrations, users, health, failures
- `docs/BACKUP-RESTORE.md` — backup/restore procedure
- `docs/ACCEPTANCE.md` — acceptance checklist
- `docs/LOAD-TEST.md` — baseline, burst, duplicate-storm targets
- `docs/paid-order.schema.json` — versioned payload schema
- `docs/examples/valid-paid-order.json` — synthetic example
