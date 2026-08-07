# Phase 1 Threat Model

## Assets worth protecting

- paid-order integrity
- customer identity/order metadata
- customer scripts and notes
- face/product/background/reference uploads
- optional voice samples
- payment/order references
- operator accounts and sessions
- private object-storage contents
- future proprietary prompts, mappings, Director content, and model configuration
- audit/history evidence

## Trust boundaries

```text
Internet / WordPress
        |
        | HMAC + timestamp + nonce + idempotency
        v
Public paid-order intake
        |
        | validated internal records only
        v
PostgreSQL app schema ---------------- Operator session boundary
        |                                      |
        | durable asset claim                  | allow-listed projections
        v                                      v
Asset worker -------------------------- Operator UI/API
        |
        | strict outbound download policy
        v
Approved WordPress upload host -> private S3 bucket

internal schema
  └─ runtime/operator denied by database privilege + application design
```

## Primary threats and controls

| Threat | Control | Evidence |
|---|---|---|
| Forged paid order | HMAC-SHA256 over exact raw bytes; key ID | webhook security tests |
| Body modified after signing | raw-byte signature verification | altered-body test |
| Old valid request replay | timestamp window + nonce claim | expired/replay tests |
| Network retry creates duplicate job | logical idempotency + DB uniqueness/locks | duplicate tests + load duplicate mode |
| Idempotency key reused for changed content | payload-bound conflict rule | PostgreSQL idempotency smoke |
| Invalid/partial order enters production | strict schema + field errors + catalogue/parity gates | validation/catalogue tests |
| Website/backend price/segment drift | versioned deterministic segmenter + declared/calculated parity | parity fixtures; final rule pending client |
| Temporary WordPress URL becomes production dependency | durable worker rehosts then clears source URL | asset tests |
| SSRF through upload URL | HTTPS, exact host allow-list, no redirects, no IP literals, no credentials/non-443 ports; egress restriction recommended | asset downloader tests + deployment control |
| Oversized/mislabeled upload | stream byte cap + content type detection + MIME/extension/size match | asset tests |
| Public customer media | private bucket + no-store + expiring signed links + audited access | storage/operator tests |
| Worker crash loses asset job | PostgreSQL leases + retry/reclaim | worker repository tests/DB design |
| Sensitive media retained forever | 30/60/90 delete metadata + retry-safe cleanup | retention tests; policy pending client |
| Operator sees proprietary internals | explicit operator view + separate `internal` schema + DB runtime denial | API leak tests + DB denial smoke |
| Stolen session token remains valid forever | random opaque session, server hash, expiry, revocation | auth tests |
| CSRF changes job status / generates file links | SameSite cookie + independent CSRF token + server hash | operator CSRF tests |
| Password guessing | scrypt + generic failures + dummy hash path + rate limit + lockout | auth tests |
| Logs leak credentials/customer content | structured safe fields only; secrets/scripts/media excluded | security review rules |
| Migration drift | ordered migration ledger + SHA-256 checksums | migration-twice CI gate |
| Backup exists but cannot restore | checksum + disposable restore drill | database integration CI |
| Compromised runtime DB credential reads proprietary schema | non-owner runtime role denied `internal` | DB smoke test |
| Unexpected traffic overload | bounded API body, DB pool/locks, async file work, load profiles | baseline/burst/stress plan |

## Deliberately out of scope for Phase 1

- AI model/prompt execution security
- Grok/OpenAI/ElevenLabs provider security
- video rendering/assembly pipeline
- final delivery routing
- customer portal authorization
- complex multi-operator RBAC
- formal external penetration test or compliance certification

These are not silently assumed safe; they are absent from Phase 1.

## Residual risks requiring deployment controls

Application checks cannot fully prevent DNS rebinding or compromised approved hosts. Restrict worker/API outbound egress where the hosting platform supports it, keep PostgreSQL/Redis private, and monitor provider access logs.

A stolen WordPress webhook secret permits valid-looking signed orders until rotated. Protect it as a production secret and rotate immediately on suspected exposure.

Signed asset URLs are bearer capabilities until expiration. Keep TTL short, send with `Cache-Control: no-store`, audit generation, and never put them in ordinary logs/tickets.

The final package/catalogue, segmentation/pricing algorithm, approved upload hosts, and retention policy remain client-controlled release blockers documented in `PLACEHOLDERS.md`.
