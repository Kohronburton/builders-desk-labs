import type { AgentDecision, AiProvider, DiagnosticResult, DiagnosticsProvider, WorkflowInput } from './types.ts';

export class HttpError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  constructor(message: string, status: number, retryable = status === 429 || status >= 500) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.retryable = retryable;
  }
}

export class HttpDiagnosticsProvider implements DiagnosticsProvider {
  private readonly url: string | (() => string);
  private readonly timeoutMs: number;
  constructor(url: string | (() => string), timeoutMs = 800) {
    this.url = url;
    this.timeoutMs = timeoutMs;
  }

  async run(input: WorkflowInput, attempt: number): Promise<DiagnosticResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(typeof this.url === 'function' ? this.url() : this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId: input.requestId, scenario: input.scenario, attempt }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.text();
        throw new HttpError(`diagnostics returned ${response.status}: ${body}`, response.status);
      }
      return await response.json() as DiagnosticResult;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new HttpError('diagnostics request timed out', 504, true);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

function classify(message: string): Pick<AgentDecision, 'category' | 'severity'> {
  const text = message.toLowerCase();
  const category = text.includes('webhook') ? 'webhook'
    : text.includes('openai') || text.includes('claude') || text.includes('gemini') || text.includes('prompt') ? 'llm'
    : text.includes('api') || text.includes('http') ? 'api'
    : text.includes('workflow') || text.includes('automation') || text.includes('email') ? 'automation'
    : 'unknown';
  const severity = text.includes('all users') || text.includes('production down') || text.includes('critical') ? 'critical'
    : text.includes('down') || text.includes('stopped') || text.includes('failing') ? 'high'
    : text.includes('intermittent') || text.includes('slow') ? 'medium'
    : 'low';
  return { category, severity };
}

export class DeterministicAiProvider implements AiProvider {
  readonly mode = 'deterministic';

  async generate(input: WorkflowInput, diagnostic: DiagnosticResult, attempt: number): Promise<unknown> {
    if (input.scenario === 'invalid-ai-once' && attempt === 1) return '{"category":"api"';
    const { category, severity } = classify(input.message);
    const requiresHuman = severity === 'critical' || input.scenario === 'permanent-failure';
    return {
      category,
      severity,
      summary: `The workflow report was classified as ${category} with ${severity} impact.`,
      probableCause: diagnostic.healthy
        ? 'The external diagnostic is healthy, so the fault is likely in payload validation, workflow branching, credentials, or model output handling.'
        : `The diagnostic signal indicates ${diagnostic.signal}.`,
      recommendedActions: [
        'Inspect the failed n8n execution and confirm the first node with unexpected output.',
        'Validate webhook payload shape and credential configuration before retrying.',
        'Keep idempotency enabled so a retry cannot duplicate downstream work.',
      ],
      requiresHuman,
      confidence: diagnostic.healthy ? 0.86 : 0.94,
    } satisfies AgentDecision;
  }
}

export class OpenAiProvider implements AiProvider {
  readonly mode = 'openai';
  private readonly apiKey: string;
  private readonly model: string;
  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generate(input: WorkflowInput, diagnostic: DiagnosticResult, attempt: number): Promise<unknown> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You are an AI workflow reliability engineer. Return only JSON with category, severity, summary, probableCause, recommendedActions, requiresHuman, confidence. category must be webhook|api|llm|automation|unknown. severity must be low|medium|high|critical. confidence must be 0-1.',
          },
          {
            role: 'user',
            content: JSON.stringify({ report: input.message, diagnostic, correctionAttempt: attempt > 1 }),
          },
        ],
      }),
    });
    if (!response.ok) throw new HttpError(`OpenAI returned ${response.status}: ${await response.text()}`, response.status);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return payload.choices?.[0]?.message?.content ?? '';
  }
}

export function createAiProvider(env: NodeJS.ProcessEnv): AiProvider {
  const mode = (env.AI_MODE ?? 'deterministic').toLowerCase();
  if (mode === 'openai') {
    if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required when AI_MODE=openai');
    return new OpenAiProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL ?? 'gpt-4o-mini');
  }
  return new DeterministicAiProvider();
}
