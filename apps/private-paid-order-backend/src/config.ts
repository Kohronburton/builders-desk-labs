import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3100),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  DATA_ENCRYPTION_KEY_B64: z.string().min(1),
  WORDPRESS_WEBHOOK_KEY_PRIMARY_ID: z.string().min(1),
  WORDPRESS_WEBHOOK_KEY_PRIMARY_SECRET: z.string().min(32),
  WORDPRESS_WEBHOOK_KEY_SECONDARY_ID: z.string().optional().default(""),
  WORDPRESS_WEBHOOK_KEY_SECONDARY_SECRET: z.string().optional().default(""),
  WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS: z.coerce.number().int().min(30).max(900).default(300),
  WEBHOOK_NONCE_TTL_SECONDS: z.coerce.number().int().min(300).max(86400).default(900),
  DEFAULT_ASSET_RETENTION_DAYS: z.coerce.number().int().refine((value) => [30, 60, 90].includes(value), "must be 30, 60, or 90").default(30),
  SEGMENTATION_POLICY_VERSION: z.string().min(1).default("PLACEHOLDER-speaker-turn-v1"),
  BUSINESS_RULES_APPROVED: z.enum(["true", "false"]).default("false"),
  OBJECT_STORAGE_ENDPOINT: z.string().url(),
  OBJECT_STORAGE_REGION: z.string().min(1).default("us-east-1"),
  OBJECT_STORAGE_BUCKET: z.string().min(3),
  OBJECT_STORAGE_ACCESS_KEY: z.string().min(1),
  OBJECT_STORAGE_SECRET_KEY: z.string().min(1),
  OBJECT_STORAGE_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("false"),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
  MAX_UPLOAD_SIZE_BYTES: z.coerce.number().int().min(1024).max(100 * 1024 * 1024).default(25 * 1024 * 1024),
  ASSET_DOWNLOAD_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(15000),
  WORDPRESS_ALLOWED_FILE_HOSTS: z.string().min(1),
  ALLOWED_UPLOAD_MIME_TYPES: z.string().min(1).default("image/jpeg,image/png,image/webp,audio/wav,audio/mpeg,audio/mp4,application/pdf"),
  ASSET_WORKER_POLL_MS: z.coerce.number().int().min(250).max(60000).default(2000),
  ASSET_WORKER_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info")
}).passthrough();

export type AppConfig = ReturnType<typeof loadConfig>;

function csv(value: string): readonly string[] {
  return Object.freeze(value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean));
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.parse(env);
  const allowedFileHosts = csv(parsed.WORDPRESS_ALLOWED_FILE_HOSTS);
  const allowedUploadMimeTypes = csv(parsed.ALLOWED_UPLOAD_MIME_TYPES);
  if (allowedFileHosts.length === 0) throw new Error("WORDPRESS_ALLOWED_FILE_HOSTS must contain at least one host");
  if (allowedUploadMimeTypes.length === 0) throw new Error("ALLOWED_UPLOAD_MIME_TYPES must contain at least one MIME type");

  if (parsed.NODE_ENV === "production") {
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.includes("PLACEHOLDER")) {
        throw new Error(`Production configuration contains unresolved placeholder: ${key}`);
      }
    }
    if (parsed.BUSINESS_RULES_APPROVED !== "true") {
      throw new Error("Production startup refused: BUSINESS_RULES_APPROVED must be true");
    }
  }

  const keys = new Map<string, string>([[parsed.WORDPRESS_WEBHOOK_KEY_PRIMARY_ID, parsed.WORDPRESS_WEBHOOK_KEY_PRIMARY_SECRET]]);
  if (parsed.WORDPRESS_WEBHOOK_KEY_SECONDARY_ID && parsed.WORDPRESS_WEBHOOK_KEY_SECONDARY_SECRET) {
    keys.set(parsed.WORDPRESS_WEBHOOK_KEY_SECONDARY_ID, parsed.WORDPRESS_WEBHOOK_KEY_SECONDARY_SECRET);
  }

  return Object.freeze({
    ...parsed,
    DEFAULT_ASSET_RETENTION_DAYS: parsed.DEFAULT_ASSET_RETENTION_DAYS as 30 | 60 | 90,
    OBJECT_STORAGE_FORCE_PATH_STYLE: parsed.OBJECT_STORAGE_FORCE_PATH_STYLE === "true",
    allowedFileHosts,
    allowedUploadMimeTypes,
    webhookKeys: keys
  });
}
