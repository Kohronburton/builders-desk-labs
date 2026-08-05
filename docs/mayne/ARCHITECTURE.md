# Mayne Architecture

Mayne is the shared application foundation beneath Builder's Desk Labs. It standardizes infrastructure without flattening the original product.

## Core rule

The foundation supports the product; it does not replace it.

```text
Mayne Foundation
├── security
├── configuration
├── logging
├── testing
├── health checks
├── module registration
├── events
├── deployment standards
└── shared UI patterns

Original Product
├── original workflow
├── original terminology
├── original visual identity
├── original business logic
├── original data model
├── original operator experience
└── original client-specific behavior
```

## Ownership rule

Foundation packages own cross-cutting infrastructure. Apps own domain concepts. No app may import another app directly. Cross-app communication must use versioned contracts or events.

Examples:

- Property management owns `Property`, `MaintenanceRequest`, `Vendor`, and `Resident`.
- Paid-order production owns `Order`, `ProductionJob`, `ScriptSegment`, and `UploadedAsset`.
- Structured-output testing owns `Schema`, `ValidationRun`, `ContractTest`, and `ResponseAttempt`.

Generic abstractions such as `Record`, `Task`, or `Attachment` must not replace meaningful domain language.

## Adoption model

Apps import only the Mayne capabilities they need. Existing apps are migrated incrementally. Their screens, workflows, terminology, and domain behavior remain intact.

## Maturity levels

`concept` → `prototype` → `demo` → `production-candidate` → `production-ready` → `archived`

No module may claim production readiness without security, backup, restore, operations, observability, and load-test evidence.

## Branch preservation

Original branches remain unchanged. Foundation upgrades use new branches or tagged versions so the evolution from original product to hardened platform remains visible.
