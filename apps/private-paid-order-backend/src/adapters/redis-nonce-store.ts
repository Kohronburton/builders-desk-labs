import { createHash } from "node:crypto";
import type { Redis } from "ioredis";
import type { NonceStore } from "../security/webhook.js";

export class RedisNonceStore implements NonceStore {
  constructor(private readonly redis: Redis, private readonly namespace = "paid-order:webhook:nonce") {}

  async claim(nonce: string, ttlSeconds: number): Promise<boolean> {
    const digest = createHash("sha256").update(nonce).digest("hex");
    const result = await this.redis.set(`${this.namespace}:${digest}`, "1", "EX", ttlSeconds, "NX");
    return result === "OK";
  }
}
