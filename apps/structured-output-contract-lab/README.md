# Structured Output Contract Lab

A proof-focused demo that compares fragile prompt-only JSON generation against strict schema-enforced structured output.

## What it demonstrates

- Editable JSON Schema
- Prompt-only mode with deliberate instruction stressors
- Strict `json_schema` structured-output mode
- Server-side Ajv validation
- Raw response viewer
- Validation status and detailed errors
- Retry/error log
- 25, 50, 75, or 100-request comparison runs
- Schema-valid success rate and average latency

## Run locally

```bash
cd apps/structured-output-contract-lab
cp .env.example .env
# add your OPENAI_API_KEY to .env
npm install
npm start
```

Open `http://localhost:3000`.

## Demo script

1. Run one request in **Prompt-only** mode.
2. Switch to **Strict schema** and run the same request.
3. Edit the schema and show that validation updates immediately.
4. Run a 25-request comparison.
5. Point to the request chips, measured success rates, raw failures, and error log.
6. Explain that the schema is now an application contract rather than a suggestion in the prompt.

## Architecture

- `public/`: responsive comparison dashboard
- `server.mjs`: OpenAI request orchestration, schema enforcement, Ajv validation, batch runner, and health endpoint
- No API key is exposed to the browser
- Test runs are sequential to avoid accidental request bursts and simplify rate-limit behavior

## Production hardening path

For a client implementation, add concurrency controls, exponential backoff with jitter, idempotency keys, cost budgets, persistent run history, observability, and provider-specific refusal/truncation handling.
