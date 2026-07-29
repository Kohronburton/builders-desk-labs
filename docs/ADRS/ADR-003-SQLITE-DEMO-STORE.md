# ADR-003: Use SQLite for the demo audit store

## Status
Accepted

## Context
The trial demo needs durable idempotency and an audit trail without requiring database provisioning.

## Decision
Use Node 22 SQLite in WAL mode with a unique request ID.

## Consequences
- Zero external database dependency.
- Fast setup and straightforward inspection.
- Production scale requires PostgreSQL and a distributed lock/idempotency adapter.
