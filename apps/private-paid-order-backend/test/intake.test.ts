import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { DraftSpeakerTurnSegmenter } from "../src/domain/segmentation.js";
import { signWebhook } from "../src/security/webhook.js";
import { MemoryIntakeRepository, MemoryNonceStore } from "./fakes.js";
import { validPaidOrder, webhookSecret } from "./fixtures.js";

async function setup() {
  const repository = new MemoryIntakeRepository();
  const nonceStore = new MemoryNonceStore();
  const app = await buildApp({
    repository,
    nonceStore,
    keyResolver: { resolve: (keyId) => keyId === "test-key" ? webhookSecret : null },
    segmenter: new DraftSpeakerTurnSegmenter(),
    encryptSourceUrl: (url) => `encrypted:${url}`,
    retentionDays: 30,
    webhookToleranceSeconds: 300,
    webhookNonceTtlSeconds: 900
  });
  return { app, repository };
}

function signedHeaders(body: string, options: { nonce?: string; timestamp?: string; idempotencyKey?: string; signature?: string } = {}) {
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000).toString();
  const nonce = options.nonce ?? `nonce-${Math.random()}`;
  return {
    "content-type": "application/json",
    "x-webhook-key-id": "test-key",
    "x-webhook-timestamp": timestamp,
    "x-webhook-nonce": nonce,
    "x-idempotency-key": options.idempotencyKey ?? "idem-1001",
    "x-webhook-signature": options.signature ?? signWebhook(webhookSecret, timestamp, nonce, Buffer.from(body))
  };
}

test("valid paid order creates exactly one job", async (t) => {
  const { app, repository } = await setup();
  t.after(() => app.close());
  const body = JSON.stringify(validPaidOrder());
  const response = await app.inject({ method: "POST", url: "/api/v1/webhooks/wordpress/paid-orders", headers: signedHeaders(body), payload: body });
  assert.equal(response.statusCode, 201);
  assert.equal(repository.acceptCalls, 1);
  assert.equal(response.json().duplicate, false);
});

test("duplicate delivery returns existing job without creating a second logical job", async (t) => {
  const { app, repository } = await setup();
  t.after(() => app.close());
  const body = JSON.stringify(validPaidOrder());
  const first = await app.inject({ method: "POST", url: "/api/v1/webhooks/wordpress/paid-orders", headers: signedHeaders(body, { nonce: "nonce-a" }), payload: body });
  const second = await app.inject({ method: "POST", url: "/api/v1/webhooks/wordpress/paid-orders", headers: signedHeaders(body, { nonce: "nonce-b" }), payload: body });
  assert.equal(first.statusCode, 201);
  assert.equal(second.statusCode, 200);
  assert.equal(second.json().jobId, first.json().jobId);
  assert.equal(second.json().duplicate, true);
  assert.equal(repository.acceptedKeys.size, 1);
});

test("bad HMAC signature is refused before order acceptance", async (t) => {
  const { app, repository } = await setup();
  t.after(() => app.close());
  const body = JSON.stringify(validPaidOrder());
  const response = await app.inject({ method: "POST", url: "/api/v1/webhooks/wordpress/paid-orders", headers: signedHeaders(body, { signature: "sha256=deadbeef" }), payload: body });
  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, "WEBHOOK_AUTH_FAILED");
  assert.equal(repository.acceptCalls, 0);
});

test("expired request is refused", async (t) => {
  const { app, repository } = await setup();
  t.after(() => app.close());
  const body = JSON.stringify(validPaidOrder());
  const timestamp = Math.floor(Date.now() / 1000 - 3600).toString();
  const response = await app.inject({ method: "POST", url: "/api/v1/webhooks/wordpress/paid-orders", headers: signedHeaders(body, { timestamp }), payload: body });
  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, "WEBHOOK_EXPIRED");
  assert.equal(repository.acceptCalls, 0);
});

test("replayed nonce is refused", async (t) => {
  const { app } = await setup();
  t.after(() => app.close());
  const body = JSON.stringify(validPaidOrder());
  const headers = signedHeaders(body, { nonce: "same-nonce" });
  const first = await app.inject({ method: "POST", url: "/api/v1/webhooks/wordpress/paid-orders", headers, payload: body });
  const replay = await app.inject({ method: "POST", url: "/api/v1/webhooks/wordpress/paid-orders", headers, payload: body });
  assert.equal(first.statusCode, 201);
  assert.equal(replay.statusCode, 409);
  assert.equal(replay.json().error.code, "WEBHOOK_REPLAYED");
});

test("altered payload fails signature verification", async (t) => {
  const { app, repository } = await setup();
  t.after(() => app.close());
  const original = JSON.stringify(validPaidOrder());
  const headers = signedHeaders(original, { nonce: "altered-nonce" });
  const changed = JSON.stringify({ ...validPaidOrder(), customer: { ...validPaidOrder().customer, firstName: "Mallory" } });
  const response = await app.inject({ method: "POST", url: "/api/v1/webhooks/wordpress/paid-orders", headers, payload: changed });
  assert.equal(response.statusCode, 401);
  assert.equal(repository.acceptCalls, 0);
});

test("invalid payload returns actionable field errors", async (t) => {
  const { app, repository } = await setup();
  t.after(() => app.close());
  const payload = validPaidOrder();
  payload.customer.email = "not-an-email";
  const body = JSON.stringify(payload);
  const response = await app.inject({ method: "POST", url: "/api/v1/webhooks/wordpress/paid-orders", headers: signedHeaders(body), payload: body });
  assert.equal(response.statusCode, 422);
  assert.equal(repository.acceptCalls, 0);
  assert.ok(response.json().error.fields.some((field: { path: string }) => field.path === "customer.email"));
});

test("website/backend segment mismatch is refused", async (t) => {
  const { app, repository } = await setup();
  t.after(() => app.close());
  const payload = validPaidOrder();
  payload.script.declaredSegmentCount = 3;
  const body = JSON.stringify(payload);
  const response = await app.inject({ method: "POST", url: "/api/v1/webhooks/wordpress/paid-orders", headers: signedHeaders(body), payload: body });
  assert.equal(response.statusCode, 422);
  assert.equal(repository.acceptCalls, 0);
  assert.ok(response.json().error.fields.some((field: { code: string }) => field.code === "SEGMENT_COUNT_MISMATCH"));
});
