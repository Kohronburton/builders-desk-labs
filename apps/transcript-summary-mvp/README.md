# Transcript Summary MVP

A Builder's Desk Labs demo for an internal AI workflow that turns call, chat, and email transcripts into structured, actionable summaries for sales and support teams.

## Why this demo exists

The target client wants a small, reliable MVP that can:

- Accept pasted call, chat, or email transcripts
- Produce a concise summary
- Extract structured fields such as contact name, company, need, intent, budget, timeline, objections, urgency, and next action
- Generate a suggested follow-up message
- Return both readable output and clean JSON
- Optionally send results to Google Sheets or a webhook
- Keep the logic reusable for future workflows

The goal of this demo is to prove reliability, structure, and extensibility rather than build a generic chatbot.

## Product thesis

The LLM should not be trusted to return loosely formatted prose and let downstream systems guess what it means.

Instead:

**Transcript -> Normalization -> Structured extraction -> Schema validation -> Human-readable summary -> Optional integrations**

The user should see a polished workflow while the system maintains a deterministic contract around the model output.

## Demo experience

1. Paste or load a synthetic transcript
2. Choose source type: Call, Chat, or Email
3. Click **Analyze Transcript**
4. See a structured result panel with:
   - Conversation summary
   - Contact and company
   - Needs / intent
   - Budget / timeline
   - Objections
   - Urgency
   - Lead / follow-up priority
   - Recommended next action
   - Draft follow-up message
5. Inspect the validated JSON payload
6. Toggle between **Prompt-only mode** and **Strict structured mode**
7. Send the validated result to a simulated Google Sheet or webhook
8. Review an execution log showing parse, validation, retry, and integration status

## What makes the demo strong

The differentiator is not the UI alone. The demo proves that the application treats AI output as a data contract.

The centerpiece is a side-by-side reliability comparison:

- **Prompt-only mode**: fields may drift, disappear, rename, or return malformed structure
- **Strict structured mode**: output is validated against a schema before it is accepted

This directly demonstrates how to build a reusable internal AI workflow that sales and support teams can trust.

## Builder's Desk Labs spine

This demo follows the repository's product spine:

**Command Center -> Workspace -> Modules -> Data Registry -> Integrations -> System Health**

Suggested mapping:

- **Command Center**: analysis count, success rate, recent runs
- **Workspace**: transcript input and result view
- **Modules**: Summary, Extraction, Follow-up, Validation
- **Data Registry**: schema and synthetic transcript fixtures
- **Integrations**: Google Sheets and webhook adapters
- **System Health**: run log, validation status, retries, error states

## Scope boundary

This is a demo-grade portfolio application, not a production CRM. It should use synthetic data only and must not include client secrets, real customer transcripts, or private contact information.

## Branch

`agent/transcript-summary-mvp`

No production implementation should begin until the specification and build plan are reviewed.