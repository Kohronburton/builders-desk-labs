# ADR-001: Keep reliability logic behind n8n

## Status
Accepted

## Context
Putting every retry, schema rule, and idempotency branch directly into n8n makes the workflow harder to unit test and easier to break during visual edits.

## Decision
Use n8n for orchestration and a small typed service for deterministic reliability rules.

## Consequences
- Core behavior is independently testable.
- n8n remains readable and adaptable.
- One additional service must be deployed and monitored.
