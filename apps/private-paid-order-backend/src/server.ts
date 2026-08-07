import { S3Client } from "@aws-sdk/client-s3";
import { Pool } from "pg";
import { Redis } from "ioredis";
import { JsonConsoleLogger } from "@mayne/foundation-core";
import { PostgresAuthRepository } from "./adapters/postgres-auth-repository.js";
import { PostgresIntakeRepository } from "./adapters/postgres-intake-repository.js";
import { PostgresOperatorRepository } from "./adapters/postgres-operator-repository.js";
import { RedisNonceStore } from "./adapters/redis-nonce-store.js";
import { buildApp } from "./app.js";
import { S3PrivateStorage } from "./assets/storage.js";
import { AuthService } from "./auth/service.js";
import { loadConfig } from "./config.js";
import { DraftSpeakerTurnSegmenter } from "./domain/segmentation.js";
import { registerOperatorRoutes } from "./operator/routes.js";
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
const s3 = new S3Client({
  region: config.OBJECT_STORAGE_REGION,
  endpoint: config.OBJECT_STORAGE_ENDPOINT,
  forcePathStyle: config.OBJECT_STORAGE_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: config.OBJECT_STORAGE_ACCESS_KEY,
    secretAccessKey: config.OBJECT_STORAGE_SECRET_KEY
  }
});
const storage = new S3PrivateStorage(s3, config.OBJECT_STORAGE_BUCKET);
const encryptor = new FieldEncryptor(config.DATA_ENCRYPTION_KEY_B64);
const segmenter = new DraftSpeakerTurnSegmenter();

if (segmenter.version !== config.SEGMENTATION_POLICY_VERSION) {
  throw new Error(`Configured segmentation policy ${config.SEGMENTATION_POLICY_VERSION} is not implemented by this build`);
}

const auth = new AuthService(new PostgresAuthRepository(pool), {
  sessionTtlSeconds: config.OPERATOR_SESSION_TTL_SECONDS,
  maxFailedAttempts: config.OPERATOR_MAX_FAILED_LOGINS,
  lockMinutes: config.OPERATOR_LOCK_MINUTES,
  auditHashKey: config.auditHashKey
});

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
    },
    privateStorage: async () => {
      const ok = await storage.health();
      return ok ? { ok: true } : { ok: false, detail: "private object storage unavailable" };
    }
  }
});

await registerOperatorRoutes(app, {
  auth,
  repository: new PostgresOperatorRepository(pool),
  storage,
  signedUrlTtlSeconds: config.SIGNED_URL_TTL_SECONDS,
  secureCookies: config.NODE_ENV === "production"
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.log("info", "shutdown started", { signal });
  await app.close();
  redis.disconnect();
  s3.destroy();
  await pool.end();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ host: "0.0.0.0", port: config.PORT });
logger.log("info", "paid-order backend listening", { port: config.PORT, environment: config.NODE_ENV });
