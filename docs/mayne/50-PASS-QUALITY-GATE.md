# Mayne 50-Pass Quality Gate

Every production-candidate module is reviewed through these 50 passes. A pass may be automated, manual, or both. Evidence links belong in the module release notes.

## Product fidelity
1. Original workflow preserved.
2. Original terminology preserved.
3. Original visual identity preserved.
4. Original business rules preserved.
5. Client-specific behavior remains app-owned.

## Architecture
6. Module manifest is valid.
7. Foundation dependencies are explicit.
8. Domain ownership is explicit.
9. No app-to-app imports exist.
10. Contracts and events are versioned.

## Configuration and secrets
11. Required configuration fails fast.
12. `.env.example` contains no secrets.
13. Secrets are never logged.
14. Production defaults are secure.
15. Key rotation is documented where applicable.

## Authentication and authorization
16. Authentication paths are tested.
17. Authorization denies by default.
18. Sensitive fields use safe projections.
19. Sessions or tokens expire and revoke correctly.
20. Privileged actions are audited.

## Data integrity
21. Database constraints protect invariants.
22. Transactions prevent partial writes.
23. Idempotency is enforced where needed.
24. Migrations are forward-safe.
25. Restore compatibility is verified.

## API and contracts
26. Inputs are schema validated.
27. Field-level errors are actionable.
28. Error responses hide internals.
29. OpenAPI or equivalent contracts are current.
30. Consumer contract tests pass.

## Files and privacy
31. File types and sizes are verified.
32. Private files are not public.
33. Signed links expire.
34. Retention and deletion are tested.
35. Sensitive data is minimized.

## Reliability and operations
36. Liveness checks pass.
37. Readiness checks cover dependencies.
38. Structured logs include correlation IDs.
39. Metrics and alert conditions are defined.
40. Runbooks cover common failures.

## Testing
41. Unit tests pass.
42. Integration tests pass.
43. End-to-end tests pass.
44. Security regression tests pass.
45. Backup restore is tested.

## Performance and release
46. Baseline load test passes.
47. Burst/high-traffic test passes.
48. Resource limits and timeouts are set.
49. CI security and dependency checks pass.
50. Release notes, rollback steps, and evidence are complete.

## Decision rule

A module cannot be labeled `production-ready` with any failed pass. Unknown business values must be marked `PLACEHOLDER`, isolated in configuration or catalogue data, and blocked from production until resolved.
