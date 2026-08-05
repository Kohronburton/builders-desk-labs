# Mayne: 50 Simplicity Passes

This second review asks one question: **Can a developer understand and use Mayne without losing the original product?**

Status legend: `PASS` means the current foundation satisfies the check. `NEXT APP` means the rule is ready but must be verified again inside each application.

## Message and naming

1. PASS — Mayne has a one-sentence purpose.
2. PASS — The primary rule is short: share infrastructure, keep product identity.
3. PASS — `apps` means original products.
4. PASS — `packages` means shared foundation.
5. PASS — `docs` contains deeper explanation.
6. PASS — Foundation package names use one `@mayne` namespace.
7. PASS — Module IDs are explicit.
8. PASS — Domain ownership is explicit.
9. PASS — Maturity status is explicit.
10. PASS — Unknown values use one marker: `PLACEHOLDER`.

## Getting started

11. PASS — Setup starts with `pnpm install`.
12. PASS — All foundation checks run with `pnpm check`.
13. PASS — `quality` remains a compatible alias.
14. PASS — The root README stays short.
15. PASS — A separate quick-start file holds onboarding detail.
16. PASS — The quick start uses six steps or fewer.
17. PASS — A minimal manifest example is included.
18. PASS — No client account is required to run foundation checks.
19. PASS — No secrets are required for foundation unit tests.
20. PASS — Failure messages come from the relevant validator or test.

## Product preservation

21. PASS — Existing property-management code is not rewritten.
22. PASS — Existing screen flow stays app-owned.
23. PASS — Existing terminology stays app-owned.
24. PASS — Existing business rules stay app-owned.
25. PASS — Existing data model stays app-owned.
26. PASS — Mayne imports are optional by capability.
27. PASS — Apps do not need the full foundation.
28. PASS — Apps cannot silently claim another app's domain.
29. NEXT APP — Every new app must list the concepts it owns.
30. NEXT APP — Every migration must compare original and Mayne-powered behavior.

## Architecture

31. PASS — Module registration has one typed contract.
32. PASS — Duplicate module IDs fail immediately.
33. PASS — App-to-app coupling is prohibited by rule.
34. PASS — Cross-app communication uses events or contracts.
35. PASS — Events carry versions.
36. PASS — Configuration fails fast when required values are missing.
37. PASS — Health status aggregates dependency results.
38. PASS — Logging is structured.
39. PASS — Foundation behavior is unit tested.
40. NEXT APP — Only extract a new package after repeated real use.

## Delivery and review

41. PASS — Foundation work stays on a dedicated branch.
42. PASS — Original branches remain available.
43. PASS — Changes enter `main` through a pull request.
44. PASS — CI validates manifests, types, and tests.
45. PASS — The existing app workflow still runs independently.
46. PASS — A failed CI run was fixed instead of ignored.
47. PASS — Production readiness remains separate from demo readiness.
48. NEXT APP — Load, security, storage, and restore checks stay app-specific.
49. PASS — Detailed standards are linked instead of placed in the README.
50. PASS — The simplest correct path is documented first.

## Result

The foundation is simpler to explain and use:

```text
Original app + only the Mayne parts it needs
```

A new developer begins with two commands:

```bash
pnpm install
pnpm check
```

The production 50-pass gate remains unchanged. These 50 simplicity passes reduce friction; they do not lower security or operational requirements.
