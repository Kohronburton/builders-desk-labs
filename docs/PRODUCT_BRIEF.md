# Product Brief

## Problem
AI-powered SaaS workflows often fail in ways that are difficult to reproduce: malformed webhook payloads, transient API failures, duplicate delivery, invalid LLM JSON, missing observability, and unsafe retries. A successful repair must address the system, not only the visible symptom.

## Goal
Demonstrate a production-minded workflow reliability pattern that can be inspected, run locally, and adapted to an existing SaaS platform.

## Primary user
An engineering lead evaluating an AI workflow engineer for n8n, LLM integrations, API troubleshooting, and long-term automation ownership.

## Success measures
- A new developer can start the system from the README.
- The four recoverable scenarios complete successfully.
- Duplicate request IDs do not repeat diagnostic or AI work.
- Permanent failures are persisted with a controlled error.
- AI output never reaches downstream consumers without validation.
- n8n workflows are importable and independently reviewable.

## Non-goals
- Rebuilding a client’s proprietary SaaS
- Providing production identity, billing, or multi-tenant authorization
- Claiming the minimal MCP transport is a complete enterprise MCP gateway
