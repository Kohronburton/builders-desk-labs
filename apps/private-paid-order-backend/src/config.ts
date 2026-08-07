import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3100),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  WORDPRESS_WEBHOOK_KEY_PRIMARY_ID: z.string().min(1),
  WORDPRESS_WEBHOOK_KEY_PRIMARY_SECRET: z.string().min(32),
  WORDPRESS_WEBHOOK_KEY_SECONDARY_ID: z.string().optional().default(""),
  WORDPRESS_WEBHOOK_KEY_SECONDARY_SECRET: z.string().optional().default(""),
  WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS: z.coerce.number().int().min(30).max(900).default(300),
  WEBHOOK_NONCE_TTL_SECONDS: z.coerce.number().int().min(300).max(86400).default(900),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info")
}).passthrough();

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.parse(env);
  if (parsed.NODE_ENV === "production") {
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.includes("PLACEHOLDER")) {
        throw new Error(`Production configuration contains unresolved placeholder: ${key}`);
      }
    }
  }
  const keys = new Map<string, string>([[parsed.WORDPRESS_WEBHOOK_KEY_PRIMARY_ID, parsed.WORDPRESS_WEBHOOK_KEY_PRIMARY_SECRET]]);
  if (parsed.WORDPRESS_WEBHOOK_KEY_SECONDARY_ID && parsed.WORDPRESS_WEBHOOK_KEY_SECONDARY_SECRET) {
    keys.set(parsed.WORDPRESS_WEBHOOK_KEY_SECONDARY_ID, parsed.WORDPRESS_WEBHOOK_KEY_SECONDARY_SECRET);
  }
  return Object.freeze({ ...parsed, webhookKeys: keys });
}
