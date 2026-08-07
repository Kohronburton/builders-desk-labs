import { Pool } from "pg";
import { Redis } from "ioredis";
import { JsonConsoleLogger } from "@mayne/foundation-core";
import { buildApp } from "./app.js";
import { PostgresIntakeRepository } from "./adapters/postgres-intake-repository.js";
import { RedisNonceStore } from "./adapters/redis-nonce-store.js";
import { loadConfig } from "./config.js";
import { DraftSpeakerTurnSegmenter } from "./domain/segmentation.js";
import { FieldEncryptor } from "./security/encryption.js";

const config = loadConfig();
const logger = new JsonConsoleLogger();
const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
});
const redis = new Redis(config.REDIS_URL, {
  connectTimeout: 5_000,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false
});
const encryptor = new FieldEncryptor(config.DATA_ENCRYPTION_KEY_B64);
const segmenter = new DraftSpeakerTurnSegmenter();

if (segmenter.version !== config.SEGMENTATION_POLICY_VERSION) {
  throw new Error(`Configured segmentation policy ${config.SEGMENTATION_POLICY_VERSION} is not implemented by this build`);
}

const app = await buildApp({
  repository: new PostgresIntakeRepository(pool),
  nonceStore: new RedisNonceStore(redis),
  keyResolver: { resolve: (keyId) => config.webhookKeys.get(keyId) ?? null },
  segmenter,
  encryptSourceUrl: (url) => encryptor.encrypt(url),
  retentionDays: config.DEFAULT_ASSET_RETENTION_DAYS,
  webhookToleranceSeconds: config.WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS,
  webhookNonceTtlSeconds: config.WEBHOOK_NONCE_TTL_SECONDS,
  logger,
  healthChecks: {
    database: async () => {
      try { await pool.query("SELECT 1"); return { ok: true }; }
      catch (error) { return { ok: false, detail: error instanceof Error ? error.message : "database error" }; }
    },
    redis: async () => {
      try { return { ok: (await redis.ping()) === "PONG" }; }
      catch (error) { return { ok: false, detail: error instanceof Error ? error.message : "redis error" }; }
    }
  }
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.log("info", "shutdown started", { signal });
  await app.close();
  redis.disconnect();
  await pool.end();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ host: "0.0.0.0", port: config.PORT });
logger.log("info", "paid-order backend listening", { port: config.PORT, environment: config.NODE_ENV });
