import type { Pool } from "pg";
import type { AssetRepository, ClaimedAsset, ExpiredAsset } from "../assets/repository.js";

export class PostgresAssetRepository implements AssetRepository {
  constructor(private readonly pool: Pool) {}

  async claimNext(workerId: string, leaseSeconds: number): Promise<ClaimedAsset | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{
        id: string;
        job_id: string;
        original_file_name: string;
        declared_content_type: string;
        size_bytes: string;
        source_url_encrypted: string;
        attempt_count: number;
      }>(
        `SELECT id, job_id, original_file_name, declared_content_type, size_bytes::text,
                source_url_encrypted, attempt_count
         FROM app.uploaded_assets
         WHERE deleted_at IS NULL
           AND source_url_encrypted IS NOT NULL
           AND ingestion_status IN ('PENDING','RETRY','IN_PROGRESS')
           AND next_attempt_at <= now()
           AND (lease_until IS NULL OR lease_until < now())
         ORDER BY created_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1`
      );
      if (!result.rowCount) {
        await client.query("COMMIT");
        return null;
      }
      const row = result.rows[0]!;
      await client.query(
        `UPDATE app.uploaded_assets
         SET ingestion_status='IN_PROGRESS', worker_id=$2,
             lease_until=now() + ($3 * interval '1 second'), attempt_count=attempt_count + 1
         WHERE id=$1`,
        [row.id, workerId, leaseSeconds]
      );
      await client.query("COMMIT");
      return {
        id: row.id,
        jobId: row.job_id,
        originalFileName: row.original_file_name,
        declaredContentType: row.declared_content_type,
        declaredSizeBytes: Number(row.size_bytes),
        encryptedSourceUrl: row.source_url_encrypted,
        attemptCount: row.attempt_count + 1
      };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* original error wins */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async complete(input: { assetId: string; storageBucket: string; storageKey: string; detectedContentType: string; sizeBytes: number; checksumSha256: string }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{ job_id: string }>(
        `UPDATE app.uploaded_assets
         SET ingestion_status='READY', storage_bucket=$2, storage_key=$3, detected_content_type=$4,
             size_bytes=$5, checksum_sha256=$6, source_url_encrypted=NULL,
             ingested_at=now(), lease_until=NULL, worker_id=NULL, last_error_code=NULL
         WHERE id=$1
         RETURNING job_id`,
        [input.assetId, input.storageBucket, input.storageKey, input.detectedContentType, input.sizeBytes, input.checksumSha256]
      );
      if (!result.rowCount) throw new Error("ASSET_NOT_FOUND");
      const jobId = result.rows[0]!.job_id;

      const remaining = await client.query(
        `SELECT 1 FROM app.uploaded_assets
         WHERE job_id=$1 AND deleted_at IS NULL AND ingestion_status <> 'READY'
         LIMIT 1`,
        [jobId]
      );
      if (!remaining.rowCount) {
        const updated = await client.query(
          `UPDATE app.jobs
           SET status='READY_FOR_PRODUCTION', updated_at=now()
           WHERE id=$1 AND status='ASSET_INGESTION_PENDING'`,
          [jobId]
        );
        if ((updated.rowCount ?? 0) > 0) {
          await client.query(
            `INSERT INTO app.job_status_history(job_id, previous_status, new_status, reason, changed_by_type, changed_by_id)
             VALUES ($1,'ASSET_INGESTION_PENDING','READY_FOR_PRODUCTION','All private assets ingested','system','asset-worker')`,
            [jobId]
          );
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* original error wins */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async fail(input: { assetId: string; errorCode: string; retryAt: Date | null }): Promise<void> {
    await this.pool.query(
      `UPDATE app.uploaded_assets
       SET ingestion_status=$2, last_error_code=$3, next_attempt_at=COALESCE($4, next_attempt_at),
           lease_until=NULL, worker_id=NULL
       WHERE id=$1`,
      [input.assetId, input.retryAt ? "RETRY" : "FAILED", input.errorCode, input.retryAt]
    );
  }

  async claimExpired(limit: number): Promise<ExpiredAsset[]> {
    const result = await this.pool.query<{ id: string; storage_key: string }>(
      `UPDATE app.uploaded_assets
       SET ingestion_status='DELETING'
       WHERE id IN (
         SELECT id FROM app.uploaded_assets
         WHERE deleted_at IS NULL AND storage_key IS NOT NULL AND delete_after <= now()
           AND ingestion_status='READY'
         ORDER BY delete_after ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       RETURNING id, storage_key`,
      [limit]
    );
    return result.rows.map((row) => ({ id: row.id, storageKey: row.storage_key }));
  }

  async markDeleted(assetId: string): Promise<void> {
    await this.pool.query(
      `UPDATE app.uploaded_assets
       SET ingestion_status='DELETED', deleted_at=now(), storage_key=NULL, source_url_encrypted=NULL,
           lease_until=NULL, worker_id=NULL
       WHERE id=$1`,
      [assetId]
    );
  }
}
