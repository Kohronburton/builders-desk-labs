import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { loadConfig } from "../src/config.js";
import { FieldEncryptor } from "../src/security/encryption.js";

test("temporary upload URLs encrypt and decrypt with authenticated encryption", () => {
  const encryptor = new FieldEncryptor(randomBytes(32).toString("base64"));
  const original = "https://wordpress.example.test/private/file.jpg?token=secret";
  const encrypted = encryptor.encrypt(original);
  assert.notEqual(encrypted, original);
  assert.equal(encryptor.decrypt(encrypted), original);
});

test("production refuses unresolved placeholders", () => {
  assert.throws(() => loadConfig({
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://db/app",
    REDIS_URL: "redis://redis:6379",
    DATA_ENCRYPTION_KEY_B64: randomBytes(32).toString("base64"),
    WORDPRESS_WEBHOOK_KEY_PRIMARY_ID: "primary",
    WORDPRESS_WEBHOOK_KEY_PRIMARY_SECRET: "0123456789abcdef0123456789abcdef",
    SEGMENTATION_POLICY_VERSION: "PLACEHOLDER-speaker-turn-v1",
    BUSINESS_RULES_APPROVED: "true"
  }), /unresolved placeholder/);
});

test("production refuses unapproved business rules", () => {
  assert.throws(() => loadConfig({
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://db/app",
    REDIS_URL: "redis://redis:6379",
    DATA_ENCRYPTION_KEY_B64: randomBytes(32).toString("base64"),
    WORDPRESS_WEBHOOK_KEY_PRIMARY_ID: "primary",
    WORDPRESS_WEBHOOK_KEY_PRIMARY_SECRET: "0123456789abcdef0123456789abcdef",
    SEGMENTATION_POLICY_VERSION: "client-v1",
    BUSINESS_RULES_APPROVED: "false"
  }), /BUSINESS_RULES_APPROVED/);
});
