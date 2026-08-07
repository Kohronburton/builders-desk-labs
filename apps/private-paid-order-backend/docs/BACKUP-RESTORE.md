# Backup and Restore

## Recovery objective for Phase 1

The backend must prove that its PostgreSQL state can be backed up and restored into a disposable environment. Managed-provider automated backups remain the recommended production primary mechanism; this repository also includes an independent logical dump/restore drill.

## Database policy

Recommended starting production policy:

- managed automated daily backups
- at least 7 days of daily recovery points
- weekly recovery point retained according to client policy
- encryption at rest
- backup access restricted to infrastructure/operations identities
- periodic restore drill, not backup existence alone

Final RPO/RTO must be agreed with the client; Phase 1 does not invent contractual recovery guarantees.

## Create a logical backup

Requires PostgreSQL client tools (`pg_dump`) on the operations machine/runner.

```bash
BACKUP_DATABASE_URL=<migration/read-capable database URL> \
BACKUP_FILE=backups/paid-orders.dump \
pnpm --filter @builders-desk/private-paid-order-backend db:backup
```

Output:

- custom-format PostgreSQL dump
- adjacent `.sha256` checksum file

The script passes password credentials through PostgreSQL environment variables instead of command-line arguments.

## Restore drill

Create an empty disposable database whose name includes `restore`, `test`, or `ci`.

```bash
RESTORE_DATABASE_URL=postgresql://.../paid_orders_restore \
BACKUP_FILE=backups/paid-orders.dump \
pnpm --filter @builders-desk/private-paid-order-backend db:restore-test
```

The restore command:

1. refuses ambiguous non-test-looking database names unless deliberately overridden
2. verifies the dump checksum
3. restores with `--clean --if-exists --no-owner --no-acl --exit-on-error`
4. verifies the migration ledger
5. verifies job table readability
6. verifies the operator-safe view exists

CI performs this drill automatically against disposable PostgreSQL.

## Restore acceptance evidence

Record for each production recovery drill:

- source backup timestamp/identifier
- SHA-256
- restore start/end timestamps
- target disposable environment
- migration count
- key table row counts
- one sample linked order/job/segment check when representative data is available
- result: pass/fail
- person/service that executed the drill

Never copy production customer data into an insecure developer environment merely to perform a restore test. Use an access-controlled recovery environment with equivalent data handling requirements.

## Object storage

Customer uploads are sensitive and have explicit 30/60/90-day application retention. Object-storage backup/versioning must not accidentally make deleted customer media persist indefinitely.

If provider versioning/replication is enabled:

- private access remains enforced
- lifecycle rules must expire prior versions according to the approved retention/privacy policy
- recovery privileges are restricted
- deletion behavior is tested

The PostgreSQL backup contains asset metadata/storage keys but not the binary customer files themselves. Recovering a full production job therefore requires both database recovery and an object-storage recovery policy appropriate to the client.

## Disaster sequence

1. stop/limit paid-order delivery if system-of-record integrity is uncertain
2. determine the last known-good recovery point
3. restore PostgreSQL to an isolated recovery environment first
4. validate migrations, row counts, relationships, and operator-safe views
5. validate private object-storage references/recovery
6. rotate credentials if the incident involved compromise
7. promote/repoint only after validation
8. run a synthetic signed order
9. reopen WordPress delivery and reconcile queued orders by external order ID/idempotency key
