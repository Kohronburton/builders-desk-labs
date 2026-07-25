export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

export class RetryExhaustedError extends Error {
  readonly code = 'RETRY_EXHAUSTED';
  readonly cause: unknown;
  readonly attempts: number;
  constructor(message: string, cause: unknown, attempts: number) {
    super(message);
    this.name = 'RetryExhaustedError';
    this.cause = cause;
    this.attempts = attempts;
  }
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(operation: (attempt: number) => Promise<T>, options: RetryOptions): Promise<{ value: T; attempts: number }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      return { value: await operation(attempt), attempts: attempt };
    } catch (error) {
      lastError = error;
      const retry = attempt < options.attempts && (options.shouldRetry?.(error, attempt) ?? true);
      if (!retry) break;
      const jitter = Math.floor(Math.random() * 30);
      const delayMs = Math.min(options.maxDelayMs, options.baseDelayMs * 2 ** (attempt - 1)) + jitter;
      options.onRetry?.(error, attempt, delayMs);
      await sleep(delayMs);
    }
  }
  throw new RetryExhaustedError('operation failed after all retry attempts', lastError, options.attempts);
}
