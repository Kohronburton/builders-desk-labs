import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { PostgresIntakeRepository } from "../src/adapters/postgres-intake-repository.js";
import { paidOrderSchema } from "../src/contracts/paid-order.js";
import { DraftSpeakerTurnSegmenter } from "../src/domain/segmentation.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const here = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(await readFile(join(here, "..", "docs", "examples", "valid-paid-order.json"), "utf8")) as Record<string, any>;
const suffix = `${Date.now()}`;
raw.eventId = `db-smoke-event-${suffix}`;
raw.order.externalOrderId = `db-smoke-order-${suffix}`;
raw.order.paymentReference = `db-smoke-payment-${suffix}`;
raw.occurredAt = new Date().toISOString();
raw.order.paidAt = raw.occurredAt;
raw.consents.acceptedAt = raw.occurredAt;
const order = paidOrderSchema.parse(raw);
const segmentation = new DraftSpeakerTurnSegmenter().segment(order);
const idempotencyKey = `db-smoke-idem-${suffix}`;

const pool = new Pool({ connectionString: databaseUrl, max: 4, connectionTimeoutMillis: 5000 });
const repository = new PostgresIntakeRepository(pool);

try {
  const first = await repository.acceptPaidOrder({
    order,
    idempotencyKey,
    payloadHash: "a".repeat(64),
    segmentation,
    encryptSourceUrl: (value) => value,
    retentionDays: 30
  });
  if (first.duplicate) throw new Error("First order was unexpectedly marked duplicate");

  const duplicate = await repository.acceptPaidOrder({
    order,
    idempotencyKey,
    payloadHash: "a".repeat(64),
    segmentation,
    encryptSourceUrl: (value) => value,
    retentionDays: 30
  });
  if (!duplicate.duplicate || duplicate.jobId !== first.jobId) {
    throw new Error("Safe duplicate did not return the original job");
  }

  let conflict = false;
  try {
    await repository.acceptPaidOrder({
      order,
      idempotencyKey,
      payloadHash: "b".repeat(64),
      segmentation,
      encryptSourceUrl: (value) => value,
      retentionDays: 30
    });
  } catch (error) {
    conflict = error instanceof Error && error.message === "IDEMPOTENCY_CONFLICT";
  }
  if (!conflict) throw new Error("Changed payload reused the idempotency key without conflict");

  console.log(`idempotency smoke: safe duplicate preserved job ${first.jobId}; changed payload refused`);
} finally {
  await pool.end();
}
