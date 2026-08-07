import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { DraftSpeakerTurnSegmenter } from "../src/domain/segmentation.js";
import { MemoryIntakeRepository, MemoryNonceStore } from "./fakes.js";

const secret = "0123456789abcdef0123456789abcdef";

test("raw webhook parser is encapsulated and does not replace normal API JSON parsing", async (t) => {
  const app = await buildApp({
    repository: new MemoryIntakeRepository(),
    nonceStore: new MemoryNonceStore(),
    keyResolver: { resolve: () => secret },
    catalogue: { validate: async () => [] },
    segmenter: new DraftSpeakerTurnSegmenter(),
    encryptSourceUrl: (value) => value,
    retentionDays: 30,
    webhookToleranceSeconds: 300,
    webhookNonceTtlSeconds: 900
  });
  t.after(() => app.close());

  app.post("/test-normal-json", async (request) => ({
    isBuffer: Buffer.isBuffer(request.body),
    body: request.body
  }));
  await app.ready();

  const response = await app.inject({
    method: "POST",
    url: "/test-normal-json",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({ email: "operator@example.test", enabled: true })
  });

  assert.equal(response.statusCode, 200);
  const parsed = response.json();
  assert.equal(parsed.isBuffer, false);
  assert.deepEqual(parsed.body, { email: "operator@example.test", enabled: true });
});
