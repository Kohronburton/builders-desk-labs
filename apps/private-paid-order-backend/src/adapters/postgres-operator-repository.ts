import type { Pool } from "pg";
import type {
  AssetAccessRecord,
  JobStatus,
  OperatorAsset,
  OperatorJobDetail,
  OperatorJobHistory,
  OperatorJobSummary,
  OperatorRepository,
  OperatorSegment
} from "../operator/repository.js";

const jobColumns = `
  job_id, public_job_number, status, external_order_id, first_name, last_name,
  package_code, template_code, performance_style_code, voice_option_code, created_at, updated_at`;

function summary(row: Record<string, unknown>): OperatorJobSummary {
  return {
    jobId: String(row.job_id),
    publicJobNumber: String(row.public_job_number),
    status: String(row.status) as JobStatus,
    externalOrderId: String(row.external_order_id),
    customerName: `${String(row.first_name)} ${String(row.last_name)}`.trim(),
    packageCode: String(row.package_code),
    templateCode: String(row.template_code),
    performanceStyleCode: String(row.performance_style_code),
    voiceOptionCode: String(row.voice_option_code),
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date
  };
}

export class PostgresOperatorRepository implements OperatorRepository {
  constructor(private readonly pool: Pool) {}

  async listJobs(input: { status?: JobStatus | undefined; query?: string | undefined; limit: number; offset: number }): Promise<OperatorJobSummary[]> {
    const queryText = input.query?.trim() ? `%${input.query.trim().replaceAll("%", "\\%").replaceAll("_", "\\_")}%` : null;
    const result = await this.pool.query<Record<string, unknown>>(
      `SELECT ${jobColumns}
       FROM app.operator_job_view
       WHERE ($1::text IS NULL OR status=$1)
         AND ($2::text IS NULL OR public_job_number ILIKE $2 ESCAPE '\\'
           OR external_order_id ILIKE $2 ESCAPE '\\'
           OR email ILIKE $2 ESCAPE '\\')
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [input.status ?? null, queryText, input.limit, input.offset]
    );
    return result.rows.map(summary);
  }

  async getJob(jobId: string): Promise<OperatorJobDetail | null> {
    const result = await this.pool.query<Record<string, unknown>>(
      `SELECT * FROM app.operator_job_view WHERE job_id=$1 LIMIT 1`,
      [jobId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      ...summary(row),
      email: String(row.email),
      phone: row.phone === null ? null : String(row.phone),
      currency: String(row.currency),
      totalAmount: Number(row.total_amount),
      paidAt: row.paid_at as Date,
      peopleCount: Number(row.people_count),
      productBranch: String(row.product_branch),
      customerNotes: row.customer_notes === null ? null : String(row.customer_notes),
      scriptText: String(row.script_text),
      declaredWordCount: Number(row.declared_word_count),
      calculatedWordCount: Number(row.calculated_word_count),
      declaredSegmentCount: Number(row.declared_segment_count),
      calculatedSegmentCount: Number(row.calculated_segment_count),
      segmentationVersion: String(row.segmentation_version)
    };
  }

  async getSegments(jobId: string): Promise<OperatorSegment[]> {
    const result = await this.pool.query<{
      id: string; sequence: number; speaker_code: string | null; segment_text: string;
      word_count: number; character_count: number; status: string;
    }>(
      `SELECT id,sequence,speaker_code,segment_text,word_count,character_count,status
       FROM app.script_segments WHERE job_id=$1 ORDER BY sequence ASC`,
      [jobId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      sequence: row.sequence,
      speakerCode: row.speaker_code,
      text: row.segment_text,
      wordCount: row.word_count,
      characterCount: row.character_count,
      status: row.status
    }));
  }

  async getAssets(jobId: string): Promise<OperatorAsset[]> {
    const result = await this.pool.query<{
      id: string; asset_type: string; original_file_name: string; detected_content_type: string | null;
      declared_content_type: string; size_bytes: string; ingestion_status: string;
      retention_policy_days: number | null; delete_after: Date | null;
    }>(
      `SELECT id,asset_type,original_file_name,detected_content_type,declared_content_type,size_bytes::text,
              ingestion_status,retention_policy_days,delete_after
       FROM app.uploaded_assets WHERE job_id=$1 AND deleted_at IS NULL ORDER BY created_at ASC`,
      [jobId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      assetType: row.asset_type,
      originalFileName: row.original_file_name,
      contentType: row.detected_content_type ?? row.declared_content_type,
      sizeBytes: Number(row.size_bytes),
      ingestionStatus: row.ingestion_status,
      retentionDays: row.retention_policy_days,
      deleteAfter: row.delete_after
    }));
  }

  async getHistory(jobId: string): Promise<OperatorJobHistory[]> {
    const result = await this.pool.query<{
      id: string;
      previous_status: string | null;
      new_status: string;
      reason: string | null;
      changed_by_type: string;
      changed_by_id: string | null;
      created_at: Date;
    }>(
      `SELECT id,previous_status,new_status,reason,changed_by_type,changed_by_id,created_at
       FROM app.job_status_history WHERE job_id=$1 ORDER BY created_at ASC, id ASC`,
      [jobId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      previousStatus: row.previous_status,
      newStatus: row.new_status,
      reason: row.reason,
      changedByType: row.changed_by_type,
      changedById: row.changed_by_id,
      createdAt: row.created_at
    }));
  }

  async getAssetForAccess(assetId: string): Promise<AssetAccessRecord | null> {
    const result = await this.pool.query<{ id: string; job_id: string; storage_key: string | null; ingestion_status: string }>(
      `SELECT id,job_id,storage_key,ingestion_status
       FROM app.uploaded_assets WHERE id=$1 AND deleted_at IS NULL LIMIT 1`,
      [assetId]
    );
    const row = result.rows[0];
    return row?.storage_key ? { id: row.id, jobId: row.job_id, storageKey: row.storage_key, ingestionStatus: row.ingestion_status } : null;
  }

  async updateStatus(input: { jobId: string; expectedCurrentStatus: JobStatus; newStatus: JobStatus; reason?: string | undefined; operatorId: string }): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `UPDATE app.jobs SET status=$3,updated_at=now()
         WHERE id=$1 AND status=$2`,
        [input.jobId, input.expectedCurrentStatus, input.newStatus]
      );
      if ((updated.rowCount ?? 0) !== 1) {
        await client.query("ROLLBACK");
        return false;
      }
      await client.query(
        `INSERT INTO app.job_status_history(job_id,previous_status,new_status,reason,changed_by_type,changed_by_id)
         VALUES ($1,$2,$3,$4,'operator',$5)`,
        [input.jobId, input.expectedCurrentStatus, input.newStatus, input.reason ?? null, input.operatorId]
      );
      await client.query(
        `INSERT INTO app.audit_events(event_type,actor_type,actor_id,resource_type,resource_id,safe_metadata)
         VALUES ('job.status_changed','operator',$1,'job',$2,$3::jsonb)`,
        [input.operatorId, input.jobId, JSON.stringify({ from: input.expectedCurrentStatus, to: input.newStatus })]
      );
      await client.query("COMMIT");
      return true;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* original error wins */ }
      throw error;
    } finally {
      client.release();
    }
  }
}
