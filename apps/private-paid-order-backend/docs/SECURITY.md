# Security Model

## Trust boundaries

1. **Public/WordPress boundary** — only the paid-order webhook is public intake. It accepts no browser session and trusts nothing until HMAC/timestamp/replay verification succeeds.
2. **Customer/order boundary** — customer metadata, script text, consent, and upload metadata live in the `app` schema and are available only to backend services that need them.
3. **Operator boundary** — operators authenticate with opaque server-side sessions. Operator responses are built from explicit safe projections and never serialize unrestricted database rows.
4. **Proprietary boundary** — internal prompts, Director content, private mappings, model configuration, and future proprietary production logic live in `internal`. Phase 1 keeps this content dummy/empty, but the boundary exists now.
5. **Private asset boundary** — customer uploads move from approved temporary WordPress URLs to a private S3-compatible bucket. Access is short-lived and audited.

## Intake controls

- HMAC-SHA256 over exact raw request bytes
- constant-time signature comparison
- key ID supports overlap during rotation
- timestamp tolerance
- Redis nonce replay prevention
- idempotency key plus database uniqueness
- PostgreSQL advisory transaction locks for concurrent duplicate delivery
- strict payload schema
- field-level errors
- deterministic pricing/segment parity gate
- body-size limit
- immediate attempt record before business processing

## Operator controls

- scrypt password hashes with per-user random salts
- generic login failure response
- dummy password verification path for unknown users
- failed-login lockout
- opaque random session tokens; database stores only SHA-256 token hashes
- session expiry/revocation
- `Secure`, `SameSite=Strict`, `HttpOnly` session cookie in production
- independent CSRF token with double-submit + server-side hash validation
- rate-limited login endpoint
- explicit job status transition policy
- audit events for login, logout, asset links, and job status changes
- HTML escaping, no inline JavaScript, restrictive CSP, no-store, noindex

## Private asset controls

- HTTPS source only
- exact hostname allow-list
- URL credentials forbidden
- non-443 source ports forbidden
- IP-literal source URLs forbidden
- HTTP redirects forbidden
- bounded request timeout
- declared and streamed byte limits
- file type detected from content, not trusted headers alone
- allowed MIME list
- detected extension must match submitted file extension
- declared MIME and size must match detected/downloaded values
- SHA-256 recorded
- randomized object keys; original customer filenames never form storage keys
- S3 object `Cache-Control: private, no-store`
- server-side object encryption request
- short-lived signed reads
- original encrypted WordPress URL removed from the record after successful ingestion
- durable retries with worker leases and crash recovery
- 30/60/90-day deletion metadata and retry-safe cleanup

## Secrets

Never commit secrets. Production secrets belong in the hosting provider/secret manager.

Separate secrets are used for separate purposes:

- webhook HMAC secrets
- temporary URL field-encryption key
- audit privacy-hash key
- object-storage credentials

Webhook key rotation allows primary and secondary keys during a transition period. Remove the old key after WordPress is confirmed using the replacement.

## Database least privilege

`internal` exists separately from operator-safe `app` views. Production should use a migration/owner credential only for migrations and a distinct runtime database credential with no `USAGE` or table privileges on `internal`.

The runtime credential must not own the database/schema. Apply the runtime grants documented in `docs/runtime-grants.sql` after replacing its explicit role placeholder.

Even if an API serializer is accidentally changed, the runtime database identity should not be able to read proprietary tables.

## Logging rules

Safe structured logs may contain:

- request ID
- external order ID
- job ID
- key ID
- idempotency key
- event names
- error codes
- timing/duration

Do not log:

- webhook secrets/signature material beyond non-secret key ID
- passwords/session/CSRF tokens
- raw temporary upload URLs
- storage credentials
- full customer scripts in application logs
- proprietary prompts/mappings
- raw customer media

Operator login IP and user-agent are keyed-hashed before persistence.

## Residual risks / deployment controls

Application URL validation reduces SSRF risk but cannot by itself prevent every DNS-rebinding/network path. Production should additionally restrict API/worker outbound network access where the hosting platform supports egress controls.

Use TLS at the edge, private networking for PostgreSQL/Redis where available, encrypted managed disks, automated backups, storage versioning where appropriate, and provider-level access logging.

Formal external penetration testing is outside Phase 1 scope but is recommended before high-value/high-volume production use.
