import { S3Client } from "@aws-sdk/client-s3";
import { Pool } from "pg";
import { JsonConsoleLogger } from "@mayne/foundation-core";
import { PostgresAssetRepository } from "./adapters/postgres-asset-repository.js";
import { AssetWorkerService } from "./assets/worker-service.js";
import { S3PrivateStorage } from "./assets/storage.js";
import { loadConfig } from "./config.js";
import { FieldEncryptor } from "./security/encryption.js";

const config = loadConfig();
const logger = new JsonConsoleLogger();
const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 8,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
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
const repository = new PostgresAssetRepository(pool);
const encryptor = new FieldEncryptor(config.DATA_ENCRYPTION_KEY_B64);
const worker = new AssetWorkerService({
  repository,
  storage,
  decryptSourceUrl: (value) => encryptor.decrypt(value),
  bucket: config.OBJECT_STORAGE_BUCKET,
  downloadPolicy: {
    allowedHosts: config.allowedFileHosts,
    allowedMimeTypes: config.allowedUploadMimeTypes,
    maxBytes: config.MAX_UPLOAD_SIZE_BYTES,
    timeoutMs: config.ASSET_DOWNLOAD_TIMEOUT_MS
  },
  maxAttempts: config.ASSET_WORKER_MAX_ATTEMPTS,
  logger
});

if (!(await storage.health())) throw new Error("Private object storage health check failed");
await pool.query("SELECT 1");

let stopping = false;
let retentionTick = 0;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.log("info", "asset worker shutdown requested", { signal });
  s3.destroy();
  await pool.end();
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

logger.log("info", "asset worker started", { pollMs: config.ASSET_WORKER_POLL_MS });
while (!stopping) {
  const worked = await worker.processOne();
  retentionTick += 1;
  if (retentionTick >= 30) {
    await worker.deleteExpired(25);
    retentionTick = 0;
  }
  if (!worked) await sleep(config.ASSET_WORKER_POLL_MS);
}
