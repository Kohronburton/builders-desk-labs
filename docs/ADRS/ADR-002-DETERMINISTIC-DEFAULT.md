# ADR-002: Default to deterministic AI mode

## Status
Accepted

## Context
A portfolio evaluator should be able to run the demo without sharing a paid API credential. Network-dependent tests are also unstable.

## Decision
Default to a deterministic provider and make live OpenAI mode an environment switch using the same output contract.

## Consequences
- Local review is reproducible and cost-free.
- Live LLM integration remains demonstrable.
- Deterministic results do not measure real model quality.
