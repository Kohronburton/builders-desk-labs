# Agile Implementation Plan

Work advances only after the current phase's code/tests/build gate is green. A later phase does not excuse a broken earlier phase.

## Phase 0 — Mayne foundation

**Goal:** reuse tested cross-cutting foundation without changing this product's domain.

Status: **GREEN**

Evidence:
- Mayne config/logging/events/health/module contracts
- application manifest validation
- shared CI foundation
- original apps remain isolated

## Phase 1 — Controlled paid-order intake

**Goal:** one authenticated webhook creates one atomic job or nothing.

Status: **GREEN**

Implemented:
- strict versioned Zod contract
- exact raw-body HMAC
- timestamp window
- key ID/rotation overlap
- Redis nonce replay protection
- immediate webhook-attempt record
- field-level errors
- pricing/segment parity gate
- Postgres advisory locks + uniqueness
- atomic linked customer/order/job/segment/asset creation
- liveness/readiness and graceful shutdown

Tests include valid, duplicate, bad HMAC, altered payload, expired request, replay, invalid field, and segment mismatch.

## Phase 2 — Private asset lifecycle

**Goal:** customer files become private backend assets and no longer depend on WordPress URLs.

Status: **GREEN**

Implemented:
- encrypted temporary source URLs
- strict source host/HTTPS/redirect/IP/port controls
- bounded downloads and content detection
- MIME/extension/size verification
- SHA-256
- private S3-compatible storage
- durable PostgreSQL worker queue with leases/retries
- automatic job readiness after all assets ingest
- 30/60/90 retention metadata
- retry-safe expiry deletion

Remaining client input: real upload hostname(s) and final retention policy.

## Phase 3 — Operator-safe production view

**Goal:** operators can do required production work without access to proprietary internals.

Status: **GREEN**

Implemented:
- ADMIN/OPERATOR accounts
- scrypt passwords
- lockout
- opaque hashed server sessions
- CSRF
- rate-limited login
- explicit operator-safe database projection
- job list/detail/segments/assets
- controlled status transitions/history/audit
- expiring private asset links
- no-JS protected HTML panel
- proprietary schema excluded from operator projection

## Phase 4 — Developer/WordPress handoff

**Goal:** another developer can integrate without waiting for the original author.

Status: **IMPLEMENTED; INTEGRATION EVIDENCE PENDING**

Implemented:
- canonical JSON Schema
- synthetic valid payload
- webhook signing/retry contract
- PHP signing example
- staging simulator
- migration runner
- operator bootstrap
- README/operations/security docs

Remaining evidence: live staging test with the actual WordPress implementation.

## Phase 5 — Operations, recovery, and traffic

**Goal:** prove the service is deployable, recoverable, and safe under concurrent intake.

Status: **IMPLEMENTED; CI/STAGING EVIDENCE IN PROGRESS**

Implemented:
- local Postgres/Redis/MinIO stack
- production container build
- runtime DB least-privilege template
- proprietary-denial DB smoke test
- backup + checksum
- guarded restore test
- baseline/burst/stress/duplicate-storm runner
- expanded CI gates

Remaining evidence:
- final CI database/container gate
- staging baseline/burst/stress measurements
- production provider backup/lifecycle configuration

## Phase 6 — Client rules and release candidate

**Goal:** replace every intentionally unknown business value with approved client data.

Status: **BLOCKED BY CLIENT PACKET / WORDPRESS CONTRACT**

Required:
- authoritative package/template/style/voice catalogue
- exact website word-count/segmentation algorithm and fixtures
- real WordPress upload hostnames
- approved sensitive-file retention policy
- real non-owner runtime DB identity

Then:
1. run full acceptance checklist
2. run staging WordPress integration
3. run load profiles
4. run backup/restore drill
5. verify runtime proprietary denial
6. record evidence
7. only then consider maturity change from `production-candidate` to `production-ready`

## Definition of progress

A phase is **GREEN** only when its automated tests and production build pass. A phase requiring external systems stays **IMPLEMENTED / EVIDENCE PENDING** until the real integration is demonstrated.
