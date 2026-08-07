# Production Placeholder Ledger

This file is the single list of business values intentionally not guessed by the implementation. A production deployment is not approved until each item is resolved from the client packet or the WordPress developer and the corresponding configuration/catalogue data is updated.

| Placeholder | Owner/source | Why it matters | Production gate |
|---|---|---|---|
| `PLACEHOLDER_PACKAGE_CATALOGUE` | Client product catalogue | Determines valid packages, templates, styles, voice choices, people limits, and compatibility rules | Catalogue records populated and contract tests pass |
| `PLACEHOLDER_SEGMENTATION_RULES` | Client + WordPress pricing implementation | Website and backend must calculate identical word/segment totals | Versioned segmenter replaced/approved and parity fixtures pass |
| `PLACEHOLDER_WORDPRESS_UPLOAD_HOSTS` | WordPress developer/hosting | Private worker accepts downloads only from exact approved hostnames | `WORDPRESS_ALLOWED_FILE_HOSTS` contains real hosts and staging upload test passes |
| `PLACEHOLDER_RETENTION_POLICY` | Client policy | Sensitive customer media must be deleted on the approved schedule | 30/60/90 default selected, legal/admin hold expectations documented, cleanup test passes |
| `PLACEHOLDER_RUNTIME_DB_ROLE` | Hosting/database administrator | Runtime DB identity must be denied access to proprietary schema | `docs/runtime-grants.sql` applied using real non-owner role and denial test passes |

## Approval rule

When all authoritative values are resolved:

1. replace the draft segmentation policy/version with the approved implementation;
2. seed the approved catalogue values;
3. configure real WordPress upload hosts;
4. configure approved retention days;
5. configure least-privilege runtime DB identity;
6. run all acceptance + integration + load + backup/restore tests;
7. set `BUSINESS_RULES_APPROVED=true` only after evidence is recorded.

The application separately refuses production startup when configuration still contains the literal string `PLACEHOLDER`.
