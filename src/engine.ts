import type { AiProvider, DiagnosticsProvider, WorkflowInput, WorkflowResult } from './types.ts';
import { parseAgentDecision } from './validation.ts';
import { ExecutionRepository } from './repository.ts';
import { HttpError } from './providers.ts';
import { withRetry } from './retry.ts';

export class DuplicateInProgressError extends Error {
  readonly code = 'DUPLICATE_IN_PROGRESS';
  constructor() {
    super('an execution with this requestId is already processing');
    this.name = 'DuplicateInProgressError';
  }
}

export interface EngineMetrics {
  started: number;
  completed: number;
  failed: number;
  duplicates: number;
  retries: number;
}

export class WorkflowEngine {
  readonly metrics: EngineMetrics = { started: 0, completed: 0, failed: 0, duplicates: 0, retries: 0 };
  private readonly repository: ExecutionRepository;
  private readonly diagnostics: DiagnosticsProvider;
  private readonly ai: AiProvider;

  constructor(repository: ExecutionRepository, diagnostics: DiagnosticsProvider, ai: AiProvider) {
    this.repository = repository;
    this.diagnostics = diagnostics;
    this.ai = ai;
  }

  async execute(input: WorkflowInput): Promise<WorkflowResult> {
    const startedAt = Date.now();
    const start = this.repository.start(input);
    if (!start.created) {
      if (start.existing?.status === 'completed' && start.existing.result) {
        this.metrics.duplicates += 1;
        return { ...start.existing.result, duplicate: true };
      }
      throw new DuplicateInProgressError();
    }

    this.metrics.started += 1;
    try {
      const diagnosticRun = await withRetry(
        (attempt) => this.diagnostics.run(input, attempt),
        {
          attempts: 3,
          baseDelayMs: 100,
          maxDelayMs: 500,
          shouldRetry: (error) => error instanceof HttpError ? error.retryable : true,
          onRetry: () => { this.metrics.retries += 1; },
        },
      );

      const aiRun = await withRetry(
        async (attempt) => parseAgentDecision(await this.ai.generate(input, diagnosticRun.value, attempt)),
        {
          attempts: 3,
          baseDelayMs: 75,
          maxDelayMs: 300,
          shouldRetry: (error) => error instanceof HttpError ? error.retryable : true,
          onRetry: () => { this.metrics.retries += 1; },
        },
      );

      const result: WorkflowResult = {
        requestId: input.requestId,
        sessionId: input.sessionId,
        status: aiRun.value.requiresHuman ? 'needs_human' : 'resolved',
        duplicate: false,
        ...aiRun.value,
        diagnostics: diagnosticRun.value,
        telemetry: {
          diagnosticsAttempts: diagnosticRun.attempts,
          aiAttempts: aiRun.attempts,
          durationMs: Date.now() - startedAt,
          aiMode: this.ai.mode,
        },
        completedAt: new Date().toISOString(),
      };
      this.repository.complete(input.requestId, result);
      this.metrics.completed += 1;
      return result;
    } catch (error) {
      this.metrics.failed += 1;
      const message = error instanceof Error ? error.message : 'unknown workflow failure';
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined;
      this.repository.fail(input.requestId, { message, code });
      throw error;
    }
  }
}
