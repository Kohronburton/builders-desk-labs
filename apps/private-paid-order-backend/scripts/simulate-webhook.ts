import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { signWebhook } from "../src/security/webhook.js";

const url = process.env.SIMULATOR_URL;
const keyId = process.env.SIMULATOR_KEY_ID;
const secret = process.env.SIMULATOR_SECRET;
if (!url || !keyId || !secret) throw new Error("SIMULATOR_URL, SIMULATOR_KEY_ID, and SIMULATOR_SECRET are required");
if (process.env.NODE_ENV === "production") throw new Error("Simulator refuses NODE_ENV=production");

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, "..", "docs", "examples", "valid-paid-order.json");
const payload = JSON.parse(await readFile(fixturePath, "utf8")) as Record<string, any>;
const now = new Date();
const unique = Date.now().toString();
payload.eventId = `sim_${unique}`;
payload.occurredAt = now.toISOString();
payload.order.externalOrderId = `sim-${unique}`;
payload.order.paymentReference = `sim-payment-${unique}`;
payload.order.paidAt = now.toISOString();
payload.consents.acceptedAt = now.toISOString();

const body = Buffer.from(JSON.stringify(payload), "utf8");
const timestamp = Math.floor(Date.now() / 1000).toString();
const nonce = crypto.randomUUID();
const idempotencyKey = `sim-${unique}-paid`;
const signature = signWebhook(secret, timestamp, nonce, body);

const response = await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-webhook-key-id": keyId,
    "x-webhook-timestamp": timestamp,
    "x-webhook-nonce": nonce,
    "x-webhook-signature": signature,
    "x-idempotency-key": idempotencyKey
  },
  body
});
const responseBody = await response.text();
console.log(`HTTP ${response.status}`);
console.log(responseBody);
if (!response.ok) process.exitCode = 1;
