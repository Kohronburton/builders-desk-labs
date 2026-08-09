# Architecture — Transcript Summary MVP

## Architecture goal

Keep the model replaceable and keep application behavior deterministic around it.

```text
Browser UI
   |
   v
Transcript API
   |
   +--> Input normalizer
   +--> Provider abstraction
   |       +--> OpenAI adapter
   |       +--> Mock adapter
   |
   +--> Structured extraction schema
   +--> Validator / retry policy
   +--> Result formatter
   |
   +--> Google Sheets adapter
   +--> Webhook adapter
   +--> Run log / metrics
```

## Recommended implementation stack

### Preferred build

- Frontend: React + TypeScript
- Backend: Node.js + TypeScript
- Validation: Zod
- API: small typed REST layer or tRPC if useful
- Tests: Vitest
- Provider: OpenAI structured outputs first, with provider interface for Claude later
- Storage: in-memory/demo fixture store for v1
- Deployment: Render or Vercel depending on final app shape

### Why this stack

The client explicitly allows Node.js or Python. For this demo, TypeScript gives us a fast path to:

- shared schemas between frontend and backend
- clear runtime validation with Zod
- structured-output testing
- a polished interactive UI
- easy reuse of Builder's Desk Labs patterns

A Python implementation is still viable, but it adds less value for this particular demo than a strong shared-schema TypeScript application. If the client's follow-up reveals a Python preference, the provider/validation architecture can be ported cleanly.

## Core domain object

```ts
interface TranscriptAnalysis {
  summary: string;
  contactName: string | null;
  company: string | null;
  needs: string[];
  intent: 'low' | 'medium' | 'high' | 'unknown';
  budget: string | null;
  timeline: string | null;
  objections: string[];
  urgency: 'low' | 'medium' | 'high' | 'critical';
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  leadStage: string;
  recommendedNextAction: string;
  followUpMessage: string;
  confidence: number;
  missingInformation: string[];
}
```

The exact enum choices should be finalized before implementation.

## Provider boundary

```ts
interface TranscriptAnalyzer {
  analyze(input: NormalizedTranscript, mode: AnalysisMode): Promise<RawAnalysisResult>;
}
```

Adapters:

- `MockTranscriptAnalyzer` for deterministic demo/testing
- `OpenAITranscriptAnalyzer` for real model calls
- future `AnthropicTranscriptAnalyzer`

No UI component should call a model provider directly.

## Validation boundary

Model output must pass a runtime schema before reaching:

- the readable results view
- Google Sheets
- webhook delivery
- metrics counted as successful

Failure path:

```text
provider response
  -> parse
  -> validate
  -> if recoverable: retry once
  -> if invalid: return typed failure
  -> log run
```

## Prompt-only comparison mode

This mode exists for demonstration, not as a recommended production path.

Use a deliberately loose response contract so the demo can surface common failures. It should be labeled clearly as a comparison mode.

The strict mode must use schema enforcement and runtime validation.

## Integration contracts

### Sheets adapter

```ts
interface SheetSink {
  appendAnalysis(record: TranscriptAnalysisRecord): Promise<IntegrationResult>;
}
```

Demo adapter can write to a fixture/log. Production adapter can use Google Sheets API.

### Webhook adapter

```ts
interface WebhookSink {
  sendAnalysis(record: TranscriptAnalysisRecord): Promise<IntegrationResult>;
}
```

Must include timeout handling and return status to the run log.

## Observability

Every analysis run should receive a `runId`.

Track:

- start/end timestamps
- duration
- provider
- model
- schema version
- mode
- validation result
- retry count
- integration outcome

No full transcript content should be required in logs.

## Privacy model

For the public demo:

- synthetic transcript fixtures only
- no secrets
- no real customer data
- no permanent transcript retention
- optional local-memory run history only

For production discussion:

- configurable retention
- encryption at rest
- access control
- audit logging
- PII policy
- provider data-retention settings

## Performance target

For a demo-sized transcript:

- local/mock analysis: < 500 ms
- real model analysis: target < 10 seconds
- UI remains responsive during processing
- integrations execute after validated output exists

## Error states to design intentionally

- empty transcript
- transcript too short
- provider timeout
- provider 429/rate limit
- invalid JSON
- schema mismatch
- failed retry
- Google Sheets failure
- webhook failure

The interface should never collapse into a generic "Something went wrong" state when a more specific status is available.

## Deployment shape

Preferred final deployment options:

### Option A — Single full-stack service
Best for a compact demo and easiest handoff.

### Option B — Vercel frontend + serverless API
Good for visual polish and quick sharing.

Decision should be made during implementation kickoff based on whether we want a live external model call or a credential-free public demo.