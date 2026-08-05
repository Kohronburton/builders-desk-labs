import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryEventBus, requireEnvironment, runHealthChecks } from "../dist/index.js";

test("fails fast when required configuration is missing", () => {
  assert.throws(() => requireEnvironment(["DATABASE_URL"], {}), /DATABASE_URL/);
});

test("publishes versioned events to subscribers", async () => {
  const bus = new InMemoryEventBus();
  const received = [];
  bus.subscribe("JobReady", async (event) => received.push(event.payload.jobId));
  await bus.publish({ id: "evt-1", type: "JobReady", occurredAt: new Date().toISOString(), version: 1, payload: { jobId: "job-1" } });
  assert.deepEqual(received, ["job-1"]);
});

test("reports degraded health when one dependency fails", async () => {
  const result = await runHealthChecks({
    database: async () => ({ ok: true }),
    storage: async () => ({ ok: false, detail: "unavailable" })
  });
  assert.equal(result.status, "degraded");
  assert.equal(result.checks.storage.ok, false);
});
