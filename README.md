# Builder's Desk Labs

A portfolio lab for production-minded software demonstrations built around real business problems—not generic CRUD tutorials.

The projects in this lab are designed to show how I move from an ambiguous operational problem to a clear domain model, safe workflow, testable architecture, and executive-ready product demonstration.

## What this lab demonstrates

- full-stack product architecture
- AI agents and human-in-the-loop workflows
- deterministic decision and rule engines
- workflow automation and exception handling
- API and integration boundaries
- operational visibility and system health
- testable domain logic
- secure use of synthetic demonstration data
- incremental delivery through reviewed branches

## Featured builds

| Project | Business problem | Engineering proof |
|---|---|---|
| [Supplier Pricing Engine](https://github.com/Kohronburton/supplier-pricing-engine) | Suppliers apply different sizing, compatibility, pricing, freight, and margin rules. | Versioned rules, deterministic pricing, explainable calculations, approvals, tests, CI, and a [live CPQ demo](https://cpq.kohronburton.com/demo). |
| [Logistics Control Tower](https://github.com/Kohronburton/logistics-control-tower) | Last-mile operations need capacity-aware planning, exception recovery, and live visibility. | React control tower, Node API, FastAPI optimizer, SSE events, graceful degradation, resilience scenarios, tests, CI, and Docker services. |
| [NOIR 01 Scroll Reveal](https://noir-cap-scroll-demo.jamalburton.chatgpt.site) | Premium product storytelling needs smooth, scroll-controlled motion without a heavy 3D runtime. | Inertial scroll scrubbing, progressive reveal, responsive layout, reduced-motion fallback, and optimized product imagery. |
| [STT Operations Command Center](https://github.com/Kohronburton/STTOne) | Disconnected systems of record create payroll, billing, reporting, and ownership risk. | Governed integration layer, source-of-truth boundaries, exception routing, executive metrics, typed Next.js prototype, and a 90-day implementation model. |

## Architecture spine

Each production-style demonstration follows a consistent product spine:

```text
Command Center
      ↓
Workspace
      ↓
Domain Modules
      ↓
Data Registry
      ↓
Integrations
      ↓
System Health
```

This keeps the user experience tied to the system beneath it. A dashboard is not treated as the product unless its data ownership, decisions, failures, and recovery paths are also modeled.

## Engineering standards

A project is not considered portfolio-ready until it can answer these questions:

1. **What business problem does it solve?**
2. **What is real, and what is simulated?**
3. **Which decisions must be deterministic and auditable?**
4. **Where can the workflow fail?**
5. **How does the system recover without duplicating or losing work?**
6. **What protects the core behavior from regression?**
7. **How would the prototype evolve into production?**

Featured projects should include:

- a 60-second demonstration path
- local setup instructions
- typed contracts and explicit domain boundaries
- automated tests for critical business behavior
- CI or another visible quality gate
- architecture and tradeoff documentation
- clear separation between implemented and planned capabilities
- synthetic data only
- no committed secrets or customer records

## Delivery workflow

Client-specific or experimental work is developed on dedicated `agent/*` branches and enters `main` through reviewed pull requests.

```text
Business problem
      ↓
Acceptance criteria
      ↓
Small working increment
      ↓
Tests and build verification
      ↓
Reviewable pull request
      ↓
Demo and documented next step
```

## Data and security rules

- Demonstrations use synthetic or publicly safe data.
- Client credentials, private records, and proprietary source material are never committed.
- Environment variables are documented through examples, never real secrets.
- Production integrations begin with read-only or sandbox access where possible.
- AI-generated output is validated before it becomes an authoritative business decision.

## About

Built by [Kohron Burton](https://kohronburton.com), a senior full-stack and AI software engineer focused on enterprise workflows, production AI systems, SaaS architecture, integrations, and operational software.
