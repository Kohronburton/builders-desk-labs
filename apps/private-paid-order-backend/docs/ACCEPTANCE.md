# Phase 1 Acceptance Checklist

A release candidate is accepted only when each applicable item has evidence. `PENDING CLIENT` items cannot be silently marked complete.

## A. Paid-order intake

- [ ] Valid signed paid order returns 201 and creates exactly one order/job.
- [ ] Safe duplicate returns 200 and existing job ID.
- [ ] 100-request duplicate storm produces exactly 1×201 + 99×200 + one job ID.
- [ ] Bad HMAC returns 401 and creates no order/job.
- [ ] Body altered after signing returns 401.
- [ ] Expired timestamp returns 401.
- [ ] Replayed nonce returns 409.
- [ ] Missing security headers are refused.
- [ ] Unknown key ID is refused.
- [ ] Every attempt is recorded with a request ID and safe metadata.
- [ ] Key rotation tested using secondary/new key.

## B. Payload and pricing contract

- [ ] JSON Schema matches the WordPress payload contract.
- [ ] Invalid fields return 422 with exact field paths/messages.
- [ ] Unknown/extra fields are rejected where contract is strict.
- [ ] `subtotal + tax = total` is enforced.
- [ ] `paymentStatus` must be `paid`.
- [ ] Website and backend word counts match approved fixtures. **PENDING CLIENT**
- [ ] Website and backend segment counts match approved fixtures. **PENDING CLIENT**
- [ ] Approved package/template/style/voice catalogue rules pass. **PENDING CLIENT**

## C. Data integrity

- [ ] Migrations apply cleanly from empty database.
- [ ] Migrations are idempotently skipped on second run.
- [ ] Applied migration checksum modification is refused.
- [ ] Customer/order/selections/consents/script/job/segments/assets are created atomically.
- [ ] Concurrent duplicate deliveries cannot create a second logical job.
- [ ] Status changes create job history.
- [ ] Important actions create audit events.

## D. Private files

- [ ] Source must use HTTPS.
- [ ] Source host must match exact production allow-list. **PENDING CLIENT HOSTS**
- [ ] Redirected/IP-literal/credential-bearing/non-443 source URLs are refused.
- [ ] Download timeout and max byte count are enforced.
- [ ] File type is detected from content.
- [ ] MIME/extension/size mismatches are refused.
- [ ] Successful file is stored under randomized private key.
- [ ] Private bucket blocks anonymous access.
- [ ] WordPress source URL is cleared after successful rehosting.
- [ ] Signed operator link expires at configured TTL.
- [ ] Signed-link creation is audited.
- [ ] 30/60/90-day retention selection approved. **PENDING CLIENT**
- [ ] Expired object deletion succeeds and row is marked deleted.
- [ ] Failed deletion returns to retryable state.

## E. Operator/admin boundary

- [ ] Anonymous operator/API request is denied.
- [ ] Passwords are scrypt-hashed, not stored in plaintext.
- [ ] Failed login lockout works.
- [ ] Session token is opaque and only its hash is stored.
- [ ] Session expires/revokes correctly.
- [ ] CSRF required for state-changing browser/API actions.
- [ ] Operator can list/open jobs.
- [ ] Operator can view permitted customer/order/script/segment/asset information.
- [ ] Operator can make only approved status transitions.
- [ ] Operator-safe response contains no proprietary fields/storage credentials/secrets.
- [ ] Runtime DB role can read operator-safe view.
- [ ] Runtime DB role is denied `internal.proprietary_content`.

## F. Operations and recovery

- [ ] `/health/live` passes for live process.
- [ ] `/health/ready` covers PostgreSQL, Redis, and private storage.
- [ ] API and worker handle graceful shutdown.
- [ ] CI typecheck/tests/build pass.
- [ ] Production container builds.
- [ ] High-severity dependency audit passes or approved exception is documented.
- [ ] Database backup created with checksum.
- [ ] Checksum-verified restore into disposable database passes.
- [ ] Managed production backup schedule configured.
- [ ] Object-storage recovery/lifecycle policy matches sensitive-data retention.
- [ ] Baseline load test passes.
- [ ] Burst load test passes.
- [ ] Stress test results recorded for capacity sizing.

## G. WordPress handoff

- [ ] WordPress developer has endpoint/header/signature contract.
- [ ] WordPress developer has JSON Schema + valid example.
- [ ] PHP signer signs and sends the same raw JSON string.
- [ ] Retry logic uses same logical idempotency key and fresh timestamp/nonce/signature.
- [ ] Synthetic valid staging order accepted.
- [ ] Duplicate staging delivery returns same job.
- [ ] Validation failure is understandable without backend developer intervention.
- [ ] Synthetic staging upload is privately rehosted.

## H. Documentation/handoff

- [ ] README quick start works from clean checkout.
- [ ] `.env.example` has no real secrets.
- [ ] deployment guide reviewed.
- [ ] operations guide reviewed.
- [ ] backup/restore guide reviewed.
- [ ] security model reviewed.
- [ ] load-test guide reviewed.
- [ ] placeholder ledger has no unresolved production blocker.
- [ ] another competent backend developer can migrate, run, test, and investigate the service using repository docs alone.

## Release rule

Do not label the module `production-ready` while any `PENDING CLIENT` item remains or any applicable security/data/recovery acceptance item fails. `production-candidate` is the correct status until real client rules, staging integrations, and production infrastructure evidence are complete.
