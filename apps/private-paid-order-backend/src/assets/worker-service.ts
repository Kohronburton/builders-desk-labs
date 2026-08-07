import { createHash, randomUUID } from "node:crypto";
import type { MayneLogger } from "@mayne/foundation-core";
import type { AssetRepository } from "./repository.js";
import type { PrivateStorage } from "./storage.js";
import { downloadAsset, type DownloadPolicy } from "./downloader.js";

export interface AssetWorkerOptions {
  repository: AssetRepository;
  storage: PrivateStorage;
  decryptSourceUrl: (encrypted: string) => string;
  bucket: string;
  downloadPolicy: DownloadPolicy;
  maxAttempts: number;
  logger: MayneLogger;
  workerId?: string;
}

function errorCode(error: unknown): string {
  if (error instanceof Error && /^[A-Z0-9_:-]+$/.test(error.message)) return error.message.slice(0, 160);
  if (error instanceof Error && error.name === "TimeoutError") return "ASSET_DOWNLOAD_TIMEOUT";
  return "ASSET_INGESTION_FAILED";
}

function retryAt(attemptCount: number, maxAttempts: number): Date | null {
  if (attemptCount >= maxAttempts) return null;
  const delaySeconds = Math.min(300, 2 ** Math.max(0, attemptCount - 1) * 5);
  return new Date(Date.now() + delaySeconds * 1000);
}

export class AssetWorkerService {
  private readonly workerId: string;

  constructor(private readonly options: AssetWorkerOptions) {
    this.workerId = options.workerId ?? `asset-${randomUUID()}`;
  }

  async processOne(): Promise<boolean> {
    const asset = await this.options.repository.claimNext(this.workerId, 120);
    if (!asset) return false;

    try {
      const sourceUrl = this.options.decryptSourceUrl(asset.encryptedSourceUrl);
      const downloaded = await downloadAsset(sourceUrl, asset.originalFileName, this.options.downloadPolicy);
      if (downloaded.bytes.byteLength !== asset.declaredSizeBytes) throw new Error("ASSET_SIZE_MISMATCH");
      if (downloaded.detectedContentType !== asset.declaredContentType.toLowerCase()) throw new Error("ASSET_MIME_MISMATCH");

      const checksumSha256 = createHash("sha256").update(downloaded.bytes).digest("hex");
      const storageKey = `customer-assets/${asset.jobId}/${randomUUID()}.${downloaded.detectedExtension}`;
      await this.options.storage.put({
        key: storageKey,
        bytes: downloaded.bytes,
        contentType: downloaded.detectedContentType,
        checksumSha256
      });
      await this.options.repository.complete({
        assetId: asset.id,
        storageBucket: this.options.bucket,
        storageKey,
        detectedContentType: downloaded.detectedContentType,
        sizeBytes: downloaded.bytes.byteLength,
        checksumSha256
      });
      this.options.logger.log("info", "private asset ingested", { assetId: asset.id, jobId: asset.jobId, bytes: downloaded.bytes.byteLength });
      return true;
    } catch (error) {
      const code = errorCode(error);
      const nextRetry = retryAt(asset.attemptCount, this.options.maxAttempts);
      await this.options.repository.fail({ assetId: asset.id, errorCode: code, retryAt: nextRetry });
      this.options.logger.log(nextRetry ? "warn" : "error", "private asset ingestion failed", {
        assetId: asset.id,
        jobId: asset.jobId,
        errorCode: code,
        attempt: asset.attemptCount,
        willRetry: Boolean(nextRetry)
      });
      return true;
    }
  }

  async deleteExpired(limit = 25): Promise<number> {
    const expired = await this.options.repository.claimExpired(limit);
    let deleted = 0;
    for (const asset of expired) {
      try {
        await this.options.storage.delete(asset.storageKey);
        await this.options.repository.markDeleted(asset.id);
        deleted += 1;
      } catch (error) {
        const code = errorCode(error);
        await this.options.repository.releaseDeletion(asset.id, code);
        this.options.logger.log("error", "expired asset deletion failed", { assetId: asset.id, errorCode: code });
      }
    }
    return deleted;
  }
}
