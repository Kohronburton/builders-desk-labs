import { createHmac, timingSafeEqual } from "node:crypto";

export interface WebhookHeaders {
  keyId: string;
  timestamp: string;
  nonce: string;
  signature: string;
  idempotencyKey: string;
}

export type WebhookGuardFailure = "BAD_SIGNATURE" | "EXPIRED_TIMESTAMP" | "REPLAYED_NONCE" | "UNKNOWN_KEY" | "BAD_HEADERS";

export interface NonceStore {
  claim(nonce: string, ttlSeconds: number): Promise<boolean>;
}

export interface KeyResolver {
  resolve(keyId: string): Promise<string | null> | string | null;
}

export interface VerifyOptions {
  nowMs?: number;
  toleranceSeconds: number;
  nonceTtlSeconds: number;
}

export interface VerifyResult {
  ok: boolean;
  failure?: WebhookGuardFailure;
}

export function signWebhook(secret: string, timestamp: string, nonce: string, rawBody: Buffer): string {
  const prefix = Buffer.from(`${timestamp}.${nonce}.`, "utf8");
  const canonical = Buffer.concat([prefix, rawBody]);
  return `sha256=${createHmac("sha256", secret).update(canonical).digest("hex")}`;
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function validTimestamp(timestamp: string, nowMs: number, toleranceSeconds: number): boolean {
  if (!/^\d{10,13}$/.test(timestamp)) return false;
  const numeric = Number(timestamp);
  if (!Number.isSafeInteger(numeric)) return false;
  const timestampMs = timestamp.length === 13 ? numeric : numeric * 1000;
  return Math.abs(nowMs - timestampMs) <= toleranceSeconds * 1000;
}

export async function verifyWebhook(
  headers: WebhookHeaders,
  rawBody: Buffer,
  nonceStore: NonceStore,
  keys: KeyResolver,
  options: VerifyOptions
): Promise<VerifyResult> {
  if (!headers.keyId || !headers.timestamp || !headers.nonce || !headers.signature || !headers.idempotencyKey) {
    return { ok: false, failure: "BAD_HEADERS" };
  }
  if (!validTimestamp(headers.timestamp, options.nowMs ?? Date.now(), options.toleranceSeconds)) {
    return { ok: false, failure: "EXPIRED_TIMESTAMP" };
  }
  const secret = await keys.resolve(headers.keyId);
  if (!secret) return { ok: false, failure: "UNKNOWN_KEY" };
  const expected = signWebhook(secret, headers.timestamp, headers.nonce, rawBody);
  if (!constantTimeEqual(expected, headers.signature)) return { ok: false, failure: "BAD_SIGNATURE" };

  // Claim only after authenticity succeeds so attackers cannot consume nonce capacity.
  const claimed = await nonceStore.claim(headers.nonce, options.nonceTtlSeconds);
  if (!claimed) return { ok: false, failure: "REPLAYED_NONCE" };
  return { ok: true };
}
