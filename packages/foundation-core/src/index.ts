export type LogLevel = "debug" | "info" | "warn" | "error";

export interface MayneLogger {
  log(level: LogLevel, message: string, context?: Readonly<Record<string, unknown>>): void;
}

export class JsonConsoleLogger implements MayneLogger {
  log(level: LogLevel, message: string, context: Readonly<Record<string, unknown>> = {}): void {
    const record = { timestamp: new Date().toISOString(), level, message, ...context };
    process.stdout.write(`${JSON.stringify(record)}\n`);
  }
}

export interface MayneEvent<TPayload = unknown> {
  id: string;
  type: string;
  occurredAt: string;
  version: number;
  payload: TPayload;
}

export type EventHandler<TPayload = unknown> = (event: MayneEvent<TPayload>) => Promise<void>;

export class InMemoryEventBus {
  readonly #handlers = new Map<string, EventHandler[]>();

  subscribe<TPayload>(type: string, handler: EventHandler<TPayload>): void {
    const handlers = this.#handlers.get(type) ?? [];
    handlers.push(handler as EventHandler);
    this.#handlers.set(type, handlers);
  }

  async publish<TPayload>(event: MayneEvent<TPayload>): Promise<void> {
    await Promise.all((this.#handlers.get(event.type) ?? []).map((handler) => handler(event)));
  }
}

export function requireEnvironment(keys: readonly string[], env: NodeJS.ProcessEnv = process.env): Readonly<Record<string, string>> {
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const key of keys) {
    const value = env[key]?.trim();
    if (!value) missing.push(key);
    else values[key] = value;
  }
  if (missing.length > 0) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  return Object.freeze(values);
}

export interface HealthResult {
  status: "healthy" | "degraded" | "unhealthy";
  checks: Readonly<Record<string, { ok: boolean; detail?: string }>>;
}

export async function runHealthChecks(checks: Readonly<Record<string, () => Promise<{ ok: boolean; detail?: string }>>>): Promise<HealthResult> {
  const entries = await Promise.all(Object.entries(checks).map(async ([name, check]) => [name, await check()] as const));
  const results = Object.fromEntries(entries);
  const failures = entries.filter(([, result]) => !result.ok).length;
  return {
    status: failures === 0 ? "healthy" : failures === entries.length ? "unhealthy" : "degraded",
    checks: results
  };
}
