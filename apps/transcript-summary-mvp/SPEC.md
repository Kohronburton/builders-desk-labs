# Product Specification — Transcript Summary MVP

## 1. Objective

Build a demo-grade internal AI tool that converts unstructured sales/support transcripts into a structured, validated action record.

Primary success condition: a user can paste a transcript and receive a trustworthy summary plus structured fields in under 10 seconds, with clear validation status and a recommended next action.

## 2. Primary users

### Sales representative
Needs to understand a conversation quickly, qualify the lead, and know what to do next.

### Support representative
Needs to identify the issue, urgency, commitments, and follow-up action without rereading the full conversation.

### Sales/support manager
Needs consistent structured fields that can be sent to Sheets, CRM systems, reports, or downstream automations.

## 3. Core user flow

### Input
- Paste transcript
- Select transcript type: Call / Chat / Email
- Optional synthetic sample loader
- Optional metadata: rep name, conversation date, account ID

### Processing
- Normalize whitespace and transcript formatting
- Detect obvious empty or low-information inputs
- Submit transcript to model through a provider abstraction
- Request schema-constrained output
- Validate response
- Retry once on recoverable schema/provider errors
- Persist run metadata in demo memory/local fixture store only

### Output
Readable view and JSON view must be generated from the same validated object.

Required fields:

- `summary`
- `contact_name`
- `company`
- `needs`
- `intent`
- `budget`
- `timeline`
- `objections`
- `urgency`
- `sentiment`
- `lead_stage`
- `recommended_next_action`
- `follow_up_message`
- `confidence`
- `missing_information`

Optional metadata:

- `source_type`
- `analyzed_at`
- `model_provider`
- `model_name`
- `schema_version`
- `run_id`

## 4. UX requirements

### Workspace
The interface should be understandable without AI expertise.

The user should not see prompts or technical controls by default.

Primary layout:

**Left:** transcript input

**Right:** structured analysis

Top-level controls:
- Load sample
- Analyze transcript
- Reset

Secondary controls:
- Prompt-only mode
- Strict structured mode
- JSON view
- Send to Sheet
- Send webhook

### Result presentation

Use cards/sections rather than a long prose block:

- Executive summary
- Qualification
- Customer needs
- Risks / objections
- Urgency and timeline
- Recommended action
- Follow-up draft

Each structured field should have a visible source-of-truth value.

### Status indicators

- `Validated`
- `Validation failed`
- `Retrying`
- `Sent to Sheet`
- `Webhook delivered`
- `Provider error`

## 5. Reliability demonstration

The demo should visibly compare two modes.

### Prompt-only mode
Simulates or invokes a looser response contract.

Expected failure examples:
- Renamed keys
- Missing fields
- Markdown wrappers
- Wrong type
- Inconsistent nested structure

### Strict structured mode
The application rejects output that does not satisfy the schema.

Expected behavior:
- Validate all required fields
- Normalize allowed null/unknown values
- Retry recoverable failures
- Never mark an invalid result as successful

## 6. Integrations

### Google Sheets adapter
Demo version:
- Credential-free simulated adapter or local CSV-backed Sheet fixture
- Show row payload before send
- Return success/failure status

Production-ready interface should support replacement with Google Sheets API without changing extraction logic.

Suggested columns:

- Run ID
- Date
- Contact
- Company
- Need
- Intent
- Budget
- Timeline
- Objections
- Urgency
- Lead stage
- Next action
- Summary

### Webhook adapter
- Configurable demo URL placeholder
- JSON POST contract
- Show request body
- Simulate success/failure in demo mode
- No live external credentials committed to repository

## 7. Data governance

Even for a demo, the system should demonstrate responsible data handling.

Controls:
- Synthetic transcripts only in repository
- No API keys in source control
- Schema version included in every output
- Run ID for auditability
- Provider/model metadata recorded
- Clear distinction between generated content and deterministic metadata
- Optional transcript purge after analysis
- Integration payload preview before sending

## 8. System health

The demo should expose operational quality rather than hiding it.

Metrics:
- Total runs
- Valid on first attempt
- Retried runs
- Failed validation
- Average latency
- Integration success rate

Run log entries:
- timestamp
- run ID
- source type
- mode
- validation result
- retry count
- integration result

## 9. Test scenarios

At minimum include synthetic fixtures for:

1. Strong sales lead with clear budget and timeline
2. Interested lead with missing budget
3. Objection-heavy conversation
4. Support escalation with high urgency
5. Short/ambiguous transcript
6. Transcript containing multiple people
7. Email thread with quoted history
8. Chat transcript with fragments/emojis
9. Deliberately malformed model response
10. Provider timeout/retry case

## 10. Acceptance criteria

The demo is ready to show when:

- A transcript can be analyzed end-to-end
- Required fields render from one validated object
- JSON view matches readable view
- Strict mode rejects malformed output
- Retry behavior is visible
- Google Sheets simulation works
- Webhook simulation works
- Run log records each execution
- At least 25 automated fixture runs can be executed
- Success-rate summary is visible
- No secrets or real client data are committed
- README explains how to run and what the demo proves

## 11. Non-goals

Not required for the first demo:
- Full CRM
- User billing
- Multi-tenant production auth
- Real call recording/transcription
- Real email inbox ingestion
- Persistent production database
- Complex RAG pipeline
- Autonomous follow-up sending

These can be discussed as expansion paths, but including them in v1 would weaken the demo by obscuring the client's actual request.