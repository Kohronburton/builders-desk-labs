import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { signWebhook } from "../src/security/webhook.js";

type ExamplePayload = {
  eventId: string;
  occurredAt: string;
  order: { externalOrderId: string; paymentReference: string; paidAt: string };
  consents: { acceptedAt: string };
  [key: string]: unknown;
};

type Result = { status: number; ms: number; body: string };

const url = process.env.LOAD_TEST_URL;
const keyId = process.env.LOAD_TEST_KEY_ID;
const secret = process.env.LOAD_TEST_SECRET;
const mode = process.env.LOAD_TEST_MODE ?? "baseline";
if (!url || !keyId || !secret) throw new Error("LOAD_TEST_URL, LOAD_TEST_KEY_ID, and LOAD_TEST_SECRET are required");
if (process.env.NODE_ENV === "production" && process.env.ALLOW_PRODUCTION_LOAD_TEST !== "true") {
  throw new Error("Load test refuses NODE_ENV=production unless ALLOW_PRODUCTION_LOAD_TEST=true");
}

const defaults: Record<string, { rps: number; seconds: number }> = {
  baseline: { rps: 5, seconds: 20 },
  burst: { rps: 25, seconds: 10 },
  stress: { rps: 50, seconds: 10 }
};
if (!["baseline", "burst", "stress", "duplicate"].includes(mode)) throw new Error(`Unknown LOAD_TEST_MODE: ${mode}`);

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(await readFile(join(here, "..", "docs", "examples", "valid-paid-order.json"), "utf8") as ExamplePayload;
const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;

function payloadFor(index: number, duplicate: boolean): ExamplePayload {
  const payload = structuredClone(fixture);
  const suffix = duplicate ? runId : `${runId}-${index}`;
  const now = new Date().toISOString();
  payload.eventId = `load-event-${suffix}`;
  payload.occurredAt = now;
  payload.order.externalOrderId = `load-order-${suffix}`;
  payload.order.paymentReference = `load-payment-${suffix}`;
  payload.order.paidAt = now;
  payload.consents.acceptedAt = now;
  return payload;
}

async function send(index: number, duplicate: boolean): Promise<Result> {
  const payload = payloadFor(index, duplicate);
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomUUID();
  const idempotencyKey = `load-idem-${duplicate ? runId : `${runId}-${index}`}`;
  const signature = signWebhook(secret!, timestamp, nonce, body);
  const started = performance.now();
  try {
    const response = await fetch(url!, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-key-id": keyId!,
        "x-webhook-timestamp": timestamp,
        "x-webhook-nonce": nonce,
        "x-webhook-signature": signature,
        "x-idempotency-key": idempotencyKey
      },
      body,
      signal: AbortSignal.timeout(15_000)
    });
    return { status: response.status, ms: performance.now() - started, body: await response.text() };
  } catch (error) {
    return { status: 0, ms: performance.now() - started, body: error instanceof Error ? error.message : "network error" };
  }
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

async function runRate(rps: number, seconds: number): Promise<Result[]> {
  const total = rps * seconds;
  const tasks: Promise<Result>[] = [];
  const origin = performance.now();
  for (let index = 0; index < total; index += 1) {
    const targetMs = (index / rps) * 1000;
    const delay = Math.max(0, targetMs - (performance.now() - origin));
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    tasks.push(send(index, false));
  }
  return Promise.all(tasks);
}

const results = mode === "duplicate"
  ? await Promise.all(Array.from({ length: 100 }, (_, index) => send(index, true)))
  : await runRate(Number(process.env.LOAD_TEST_RPS ?? defaults[mode]!.rps), Number(process.env.LOAD_TEST_SECONDS ?? defaults[mode]!.seconds));

const statusCounts = new Map<number, number>();
for (const result of results) statusCounts.set(result.status, (statusCounts.get(result.status) ?? 0) + 1);
const latencies = results.map((result) => result.ms);
const success = results.filter((result) => result.status >= 200 && result.status < 300).length;
const failureSamples = results.filter((result) => result.status < 200 || result.status >= 300).slice(0, 3);

console.log(JSON.stringify({
  mode,
  requests: results.length,
  success,
  failed: results.length - success,
  statuses: Object.fromEntries([...statusCounts.entries()].sort((a, b) => a[0] - b[0])),
  latencyMs: {
    p50: Number(percentile(latencies, 50).toFixed(1)),
    p95: Number(percentile(latencies, 95).toFixed(1)),
    p99: Number(percentile(latencies, 99).toFixed(1)),
    max: Number(Math.max(...latencies).toFixed(1))
  }
}, null, 2));

if (failureSamples.length) console.error("failure samples:", failureSamples);

if (mode === "duplicate") {
  const newCount = statusCounts.get(201) ?? 0;
  const duplicateCount = statusCounts.get(200) ?? 0;
  const jobIds = new Set<string>();
  for (const result of results) {
    if (result.status !== 200 && result.status !== 201) continue;
    try {
      const parsed = JSON.parse(result.body) as { jobId?: unknown };
      if (typeof parsed.jobId === "string") jobIds.add(parsed.jobId);
    } catch {
      // Non-JSON success is a contract failure below because no job ID is collected.
    }
  }
  if (newCount !== 1 || duplicateCount !== 99 || jobIds.size !== 1) {
    console.error(`duplicate-storm failed: expected 1x201 + 99x200 + one jobId; got ${newCount}x201 + ${duplicateCount}x200 + ${jobIds.size} jobIds`);
    process.exitCode = 1;
  }
} else if (success !== results.length) {
  process.exitCode = 1;
}
