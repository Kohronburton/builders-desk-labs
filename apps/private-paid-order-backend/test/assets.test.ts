import test from "node:test";
import assert from "node:assert/strict";
import type { MayneLogger } from "@mayne/foundation-core";
import { downloadAsset } from "../src/assets/downloader.js";
import type { AssetRepository, ClaimedAsset, ExpiredAsset } from "../src/assets/repository.js";
import type { PrivateStorage } from "../src/assets/storage.js";
import { AssetWorkerService } from "../src/assets/worker-service.js";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlZ8AAAAASUVORK5CYII=", "base64");
const originalFetch = globalThis.fetch;

const logger: MayneLogger = { log: () => undefined };

class FakeAssetRepository implements AssetRepository {
  claimed: ClaimedAsset | null = null;
  completed: Parameters<AssetRepository["complete"]>[0] | null = null;
  failed: Parameters<AssetRepository["fail"]>[0] | null = null;
  releasedDeletion: string | null = null;
  expired: ExpiredAsset[] = [];

  async claimNext(): Promise<ClaimedAsset | null> {
    const value = this.claimed;
    this.claimed = null;
    return value;
  }
  async complete(input: Parameters<AssetRepository["complete"]>[0]): Promise<void> { this.completed = input; }
  async fail(input: Parameters<AssetRepository["fail"]>[0]): Promise<void> { this.failed = input; }
  async claimExpired(): Promise<ExpiredAsset[]> { return this.expired.splice(0); }
  async markDeleted(): Promise<void> {}
  async releaseDeletion(assetId: string): Promise<void> { this.releasedDeletion = assetId; }
}

class FakeStorage implements PrivateStorage {
  puts: Array<{ key: string; bytes: Buffer; contentType: string; checksumSha256: string }> = [];
  deleted: string[] = [];
  failDelete = false;
  async put(input: { key: string; bytes: Buffer; contentType: string; checksumSha256: string }): Promise<void> { this.puts.push(input); }
  async signedGet(key: string): Promise<string> { return `https://signed.example/${key}`; }
  async delete(key: string): Promise<void> {
    if (this.failDelete) throw new Error("STORAGE_DELETE_FAILED");
    this.deleted.push(key);
  }
  async health(): Promise<boolean> { return true; }
}

function mockPngFetch() {
  globalThis.fetch = (async () => new Response(png, {
    status: 200,
    headers: { "content-type": "image/png", "content-length": String(png.byteLength) }
  })) as typeof fetch;
}

test("asset downloader refuses non-allow-listed hosts before network access", async (t) => {
  let called = false;
  globalThis.fetch = (async () => { called = true; throw new Error("should not run"); }) as typeof fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  await assert.rejects(
    () => downloadAsset("https://evil.example/file.png", "file.png", {
      allowedHosts: ["uploads.example.test"], allowedMimeTypes: ["image/png"], maxBytes: 1024, timeoutMs: 1000
    }),
    /ASSET_SOURCE_HOST_NOT_ALLOWED/
  );
  assert.equal(called, false);
});

test("asset downloader detects content instead of trusting declared HTTP type", async (t) => {
  mockPngFetch();
  t.after(() => { globalThis.fetch = originalFetch; });
  const downloaded = await downloadAsset("https://uploads.example.test/file.png", "file.png", {
    allowedHosts: ["uploads.example.test"], allowedMimeTypes: ["image/png"], maxBytes: 1024, timeoutMs: 1000
  });
  assert.equal(downloaded.detectedContentType, "image/png");
  assert.equal(downloaded.detectedExtension, "png");
  assert.deepEqual(downloaded.bytes, png);
});

test("asset downloader enforces byte ceiling", async (t) => {
  mockPngFetch();
  t.after(() => { globalThis.fetch = originalFetch; });
  await assert.rejects(
    () => downloadAsset("https://uploads.example.test/file.png", "file.png", {
      allowedHosts: ["uploads.example.test"], allowedMimeTypes: ["image/png"], maxBytes: 16, timeoutMs: 1000
    }),
    /ASSET_TOO_LARGE/
  );
});

test("asset worker rehosts a verified file and completes its private record", async (t) => {
  mockPngFetch();
  t.after(() => { globalThis.fetch = originalFetch; });
  const repository = new FakeAssetRepository();
  const storage = new FakeStorage();
  repository.claimed = {
    id: "asset-1", jobId: "job-1", originalFileName: "face.png", declaredContentType: "image/png",
    declaredSizeBytes: png.byteLength, encryptedSourceUrl: "encrypted-source", attemptCount: 1
  };
  const worker = new AssetWorkerService({
    repository, storage, decryptSourceUrl: () => "https://uploads.example.test/face.png", bucket: "private-assets",
    downloadPolicy: { allowedHosts: ["uploads.example.test"], allowedMimeTypes: ["image/png"], maxBytes: 1024, timeoutMs: 1000 },
    maxAttempts: 5, logger, workerId: "test-worker"
  });
  assert.equal(await worker.processOne(), true);
  assert.equal(storage.puts.length, 1);
  assert.equal(repository.completed?.assetId, "asset-1");
  assert.equal(repository.failed, null);
  assert.ok(storage.puts[0]!.key.startsWith("customer-assets/job-1/"));
});

test("failed retention deletion is released for retry", async () => {
  const repository = new FakeAssetRepository();
  const storage = new FakeStorage();
  storage.failDelete = true;
  repository.expired = [{ id: "asset-old", storageKey: "customer-assets/job/old.png" }];
  const worker = new AssetWorkerService({
    repository, storage, decryptSourceUrl: (value) => value, bucket: "private-assets",
    downloadPolicy: { allowedHosts: ["uploads.example.test"], allowedMimeTypes: ["image/png"], maxBytes: 1024, timeoutMs: 1000 },
    maxAttempts: 5, logger, workerId: "test-worker"
  });
  assert.equal(await worker.deleteExpired(), 0);
  assert.equal(repository.releasedDeletion, "asset-old");
});
