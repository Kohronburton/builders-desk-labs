export interface ClaimedAsset {
  id: string;
  jobId: string;
  originalFileName: string;
  declaredContentType: string;
  declaredSizeBytes: number;
  encryptedSourceUrl: string;
  attemptCount: number;
}

export interface ExpiredAsset {
  id: string;
  storageKey: string;
}

export interface AssetRepository {
  claimNext(workerId: string, leaseSeconds: number): Promise<ClaimedAsset | null>;
  complete(input: { assetId: string; storageBucket: string; storageKey: string; detectedContentType: string; sizeBytes: number; checksumSha256: string }): Promise<void>;
  fail(input: { assetId: string; errorCode: string; retryAt: Date | null }): Promise<void>;
  claimExpired(limit: number): Promise<ExpiredAsset[]>;
  markDeleted(assetId: string): Promise<void>;
}
