import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { loadConfig } from "../src/config.js";
import { FieldEncryptor } from "../src/security/encryption.js";

function productionEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://db/app",
    REDIS_URL: "redis://redis:6379",
    DATA_ENCRYPTION_KEY_B64: randomBytes(32).toString("base64"),
    AUDIT_HASH_KEY_B64: randomBytes(32).toString("base64"),
    WORDPRESS_WEBHOOK_KEY_PRIMARY_ID: "primary",
    WORDPRESS_WEBHOOK_KEY_PRIMARY_SECRET: "0123456789abcdef0123456789abcdef",
    SEGMENTATION_POLICY_VERSION: "client-v1",
    BUSINESS_RULES_APPROVED: "true",
    OBJECT_STORAGE_ENDPOINT: "https://storage.example.test",
    OBJECT_STORAGE_BUCKET: "private-assets",
    OBJECT_STORAGE_ACCESS_KEY: "access-key",
    OBJECT_STORAGE_SECRET_KEY: "secret-key",
    WORDPRESS_ALLOWED_FILE_HOSTS: "uploads.example.test",
    ...overrides
  };
}

test("temporary upload URLs encrypt and decrypt with authenticated encryption", () => {
  const encryptor = new FieldEncryptor(randomBytes(32).toString("base64"));
  const original = "https://wordpress.example.test/private/file.jpg?token=secret";
  const encrypted = encryptor.encrypt(original);
  assert.notEqual(encrypted, original);
  assert.equal(encryptor.decrypt(encrypted), original);
});

test("production refuses unresolved placeholders", () => {
  assert.throws(() => loadConfig(productionEnv({ SEGMENTATION_POLICY_VERSION: "PLACEHOLDER-speaker-turn-v1" })), /unresolved placeholder/);
});

test("production refuses unapproved business rules", () => {
  assert.throws(() => loadConfig(productionEnv({ BUSINESS_RULES_APPROVED: "false" })), /BUSINESS_RULES_APPROVED/);
});

test("asset source host allow-list is normalized", () => {
  const config = loadConfig(productionEnv({ WORDPRESS_ALLOWED_FILE_HOSTS: "Uploads.Example.Test,cdn.example.test" }));
  assert.deepEqual(config.allowedFileHosts, ["uploads.example.test", "cdn.example.test"]);
});

test("privacy hash key must be exactly 32 bytes", () => {
  assert.throws(() => loadConfig(productionEnv({ AUDIT_HASH_KEY_B64: Buffer.from("short").toString("base64") })), /AUDIT_HASH_KEY_B64/);
});
