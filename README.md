# Builder's Desk Labs

Original products, powered by **Mayne**.

Mayne handles the repeated foundation work. Each app keeps its own workflow, design, language, data, and business logic.

```text
apps/       original products
packages/   shared Mayne foundation
docs/       deeper technical guidance
```

## Start

```bash
pnpm install
pnpm check
```

`pnpm check` validates module manifests, TypeScript, and tests.

## Simple rule

**Share infrastructure. Keep product identity.**

Mayne can provide configuration, logging, events, health checks, testing, authentication, audit, storage, and deployment standards. Apps only import the parts they need.

The current property-management app remains the original product and is registered with Mayne without being rewritten.

## Architecture

**Command Center → Workspace → Modules → Data Registry → Integrations → System Health**

## Branches

Original branches stay preserved. Mayne upgrades happen on separate branches and enter `main` through reviewed pull requests.

Use synthetic demo data only. Never commit client secrets or personal records.

## More detail

- [Mayne Quick Start](docs/mayne/QUICKSTART.md)
- [Mayne Architecture](docs/mayne/ARCHITECTURE.md)
- [Production 50-Pass Gate](docs/mayne/50-PASS-QUALITY-GATE.md)
- [Simplicity 50-Pass Review](docs/mayne/50-SIMPLICITY-PASSES.md)
