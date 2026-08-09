# Build Plan — Transcript Summary MVP

## Objective

Build the smallest polished demo that proves three things:

1. Unstructured transcripts can be converted into useful structured sales/support data.
2. Strict schema validation is materially more reliable than prompt-only formatting.
3. The result can safely feed Google Sheets and webhook-based workflows.

The demo should be strong enough to attach to an Upwork proposal and small enough to build, test, and explain without turning into a mini-CRM.

## Phase 0 — Review gate

Before implementation, confirm:

- TypeScript full-stack vs Python backend preference
- Whether the public demo should make real OpenAI calls or run credential-free with a deterministic mock
- Whether Google Sheets should be simulated or connected to a demo Sheet
- Whether we want the reliability benchmark to run 25, 50, or 100 fixture requests

Recommended defaults:

- TypeScript full-stack
- credential-free public demo with optional real-provider mode
- simulated Sheets adapter for public deployment
- 50 benchmark runs

## Phase 1 — Product shell

Build the Builder's Desk Labs application frame:

- Command Center
- Transcript Workspace
- Data Registry
- Integrations
- System Health

Deliverable: polished responsive shell with synthetic data.

## Phase 2 — Transcript workspace

Build:

- transcript textarea
- source type selector
- sample transcript loader
- analyze action
- loading/progress state
- structured result cards
- raw JSON view
- reset action

Deliverable: complete UX using deterministic mock results.

## Phase 3 — Schema and analysis engine

Build shared schema and typed analysis pipeline.

- normalize input
- define analysis schema
- provider interface
- strict validation
- retry policy
- typed error states

Deliverable: all UI results originate from one validated analysis object.

## Phase 4 — Reliability comparison

Build the visual proof:

### Prompt-only
- allow simulated malformed variants
- capture renamed/missing/wrong-type fields

### Strict
- enforce schema
- reject invalid responses
- retry recoverable failures

Add benchmark runner:

- 25–100 synthetic executions
- valid-first-attempt count
- retry count
- final validation success rate
- latency summary

Deliverable: side-by-side measurable reliability evidence.

## Phase 5 — Integrations

### Google Sheets
- payload preview
- append/simulate append
- success/failure feedback

### Webhook
- payload preview
- simulated endpoint
- delivery status

Deliverable: validated output can flow into downstream systems without copy/paste.

## Phase 6 — System Health

Build run history and metrics:

- run ID
- date/time
- source type
- mode
- schema version
- status
- retries
- latency
- integration status

Deliverable: operational visibility suitable for a client demo.

## Phase 7 — Test pack

Automated coverage should include:

- normalization
- schema acceptance/rejection
- missing optional values
- malformed model output
- retry handling
- integration payload generation
- benchmark aggregation

Synthetic fixture coverage:

- sales lead
- support escalation
- missing budget
- multiple speakers
- email thread
- short chat
- objection-heavy lead
- ambiguous transcript

## Phase 8 — Proposal assets

Produce:

- live demo URL
- GitHub branch/PR
- 1-page PDF case study
- screenshot/GIF if useful
- concise proposal paragraph describing what the demo proves

## Demo script

The client-facing walkthrough should take under 90 seconds:

1. Load a sample sales call.
2. Analyze in prompt-only mode and show an inconsistent response.
3. Switch to strict mode.
4. Show validated structured fields.
5. Open the raw JSON.
6. Send the result to the simulated Google Sheet.
7. Open System Health and show validation/run history.
8. Mention that the provider and integration adapters are replaceable.

## Estimated implementation effort

Focused version:

- product shell + UX: 3–5 hours
- schema/provider pipeline: 2–4 hours
- reliability benchmark: 2–3 hours
- integrations: 1–2 hours
- tests/polish/docs: 2–4 hours

Total estimated internal build effort: **10–18 hours**.

This estimate is for the portfolio demo, not the client's full implementation.

## Client project estimate

For the posted $850 MVP, a sensible delivery plan would be:

- discovery/spec alignment: 1–2 hours
- implementation: 8–12 hours
- testing/polish: 2–4 hours
- handoff: 1 hour

Estimated client effort: **12–19 hours**, depending on the integration depth.

## What not to build before applying

Do not spend time on:

- full authentication
- production database
- CRM integrations beyond the requested Sheet/webhook path
- transcription/audio upload
- multi-user roles
- complex dashboards
- RAG
- autonomous outbound messaging

Those features dilute the proof and delay the proposal.

## Go / no-go criteria

Proceed to implementation if we agree that:

- the $850 job is worth the Connect spend
- the demo can be reused for other structured-output/AI workflow jobs
- the build remains under the scope above

If any of those are false, keep the docs as a reusable specification and do not build.