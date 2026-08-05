# Builder's Desk Labs

A modular portfolio lab for production-style client MVPs, AI agents, workflow automation, data platforms, and full-stack product demonstrations.

## Powered by Mayne

Mayne is the shared application foundation beneath Builder's Desk Labs. It provides reusable configuration, security, logging, testing, health, events, module registration, deployment standards, and shared UI patterns without replacing the original product.

Every app keeps its own workflow, terminology, visual identity, business logic, data model, operator experience, and client-specific behavior.

## Architecture spine

**Command Center → Workspace → Modules → Data Registry → Integrations → System Health**

```text
Builder's Desk Labs
├── apps/                    # Original products and client-specific modules
├── packages/
│   ├── foundation-core/     # Cross-cutting Mayne infrastructure
│   └── module-sdk/          # Typed module contracts and registry
├── docs/mayne/              # Architecture and quality standards
└── scripts/                 # Automated architecture validation
```

## Boundary rule

Foundation packages own reusable infrastructure. Apps own meaningful domain concepts. Apps may not import other apps directly; integration occurs through explicit, versioned contracts or events.

## Quality bar

Mayne uses a 50-pass quality gate covering product fidelity, architecture, security, data integrity, API contracts, privacy, reliability, testing, performance, and release readiness. Unknown business values are marked `PLACEHOLDER` and cannot ship as production-ready.

## Branch strategy

Client-specific implementations live on dedicated `agent/*` or `feature/*` branches and enter `main` through reviewed pull requests. Original branches are preserved to show the evolution from the first working product to a hardened Mayne-powered version.

Demo data must be synthetic and must never contain client secrets or personal records.

## Current applications

- `apps/property-management-automation` — original property-management product, now registered with Mayne without changing its domain behavior.

See [Mayne Architecture](docs/mayne/ARCHITECTURE.md) and the [50-Pass Quality Gate](docs/mayne/50-PASS-QUALITY-GATE.md).
