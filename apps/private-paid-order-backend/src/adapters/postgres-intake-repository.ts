import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { IntakeRepository, WebhookAttemptFinish, WebhookAttemptStart, AcceptedOrderResult } from "../intake/repository.js";

function publicJobNumber(now = new Date()): string {
  const day = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `JOB-${day}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

async function rollbackQuietly(client: PoolClient): Promise<void> {
  try { await client.query("ROLLBACK"); } catch { /* original error wins */ }
}

export class PostgresIntakeRepository implements IntakeRepository {
  constructor(private readonly pool: Pool) {}

  async recordAttemptStart(attempt: WebhookAttemptStart): Promise<void> {
    await this.pool.query(
      `INSERT INTO app.webhook_attempts
       (request_id, received_at, source_ip, key_id, nonce_hash, idempotency_key, payload_hash, final_status, safe_headers)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'received',$8::jsonb)`,
      [
        attempt.requestId,
        attempt.receivedAt,
        attempt.sourceIp ?? null,
        attempt.keyId ?? null,
        attempt.nonceHash ?? null,
        attempt.idempotencyKey ?? null,
        attempt.payloadHash,
        JSON.stringify(attempt.safeHeaders)
      ]
    );
  }

  async recordAttemptFinish(attempt: WebhookAttemptFinish): Promise<void> {
    await this.pool.query(
      `UPDATE app.webhook_attempts
       SET external_order_id=$2, signature_status=$3, timestamp_status=$4, replay_status=$5,
           validation_status=$6, final_status=$7, http_response_code=$8, failure_code=$9,
           failure_details=$10::jsonb, processing_duration_ms=$11
       WHERE request_id=$1`,
      [
        attempt.requestId,
        attempt.externalOrderId ?? null,
        attempt.signatureStatus,
        attempt.timestampStatus,
        attempt.replayStatus,
        attempt.validationStatus,
        attempt.finalStatus,
        attempt.httpResponseCode,
        attempt.failureCode ?? null,
        attempt.failureDetails === undefined ? null : JSON.stringify(attempt.failureDetails),
        attempt.processingDurationMs
      ]
    );
  }

  async acceptPaidOrder(input: Parameters<IntakeRepository["acceptPaidOrder"]>[0]): Promise<AcceptedOrderResult> {
    const { order, idempotencyKey, payloadHash, segmentation, encryptSourceUrl, retentionDays } = input;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`order:${order.order.externalOrderId}`]);
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`idem:${idempotencyKey}`]);

      const existing = await client.query<{
        order_id: string;
        external_order_id: string;
        job_id: string;
        public_job_number: string;
      }>(
        `SELECT o.id AS order_id, o.external_order_id, j.id AS job_id, j.public_job_number
         FROM app.orders o JOIN app.jobs j ON j.order_id=o.id
         WHERE o.external_order_id=$1 OR o.idempotency_key=$2 OR o.payment_reference=$3 OR o.event_id=$4
         LIMIT 1`,
        [order.order.externalOrderId, idempotencyKey, order.order.paymentReference, order.eventId]
      );
      if (existing.rowCount) {
        const row = existing.rows[0]!;
        if (row.external_order_id !== order.order.externalOrderId) {
          throw new Error("IDEMPOTENCY_CONFLICT");
        }
        await client.query("COMMIT");
        return { duplicate: true, orderId: row.order_id, jobId: row.job_id, publicJobNumber: row.public_job_number };
      }

      const customerResult = await client.query<{ id: string }>(
        `INSERT INTO app.customers
         (external_customer_id, first_name, last_name, email, email_normalized, phone)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [
          order.customer.externalCustomerId ?? null,
          order.customer.firstName,
          order.customer.lastName,
          order.customer.email,
          order.customer.email.trim().toLowerCase(),
          order.customer.phone ?? null
        ]
      );
      const customerId = customerResult.rows[0]!.id;

      const orderResult = await client.query<{ id: string }>(
        `INSERT INTO app.orders
         (customer_id, external_order_id, payment_reference, idempotency_key, event_id, schema_version,
          currency, subtotal_amount, tax_amount, total_amount, payment_status, paid_at, source_payload_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'paid',$11,$12) RETURNING id`,
        [customerId, order.order.externalOrderId, order.order.paymentReference, idempotencyKey, order.eventId,
          order.schemaVersion, order.order.currency, order.order.subtotal, order.order.tax, order.order.total,
          order.order.paidAt, payloadHash]
      );
      const orderId = orderResult.rows[0]!.id;

      await client.query(
        `INSERT INTO app.order_selections
         (order_id, package_code, people_count, product_branch, template_code, performance_style_code, voice_option_code, customer_notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [orderId, order.production.packageCode, order.production.peopleCount, order.production.productBranch,
          order.production.templateCode, order.production.performanceStyleCode, order.production.voiceOptionCode,
          order.production.customerNotes ?? null]
      );

      await client.query(
        `INSERT INTO app.order_consents
         (order_id, terms_accepted, media_processing_accepted, voice_processing_accepted, accepted_at, terms_version)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [orderId, order.consents.termsAccepted, order.consents.mediaProcessingAccepted,
          order.consents.voiceProcessingAccepted, order.consents.acceptedAt, order.consents.termsVersion]
      );

      const scriptResult = await client.query<{ id: string }>(
        `INSERT INTO app.scripts
         (order_id, original_text, normalized_text, speaker_mode, declared_word_count, calculated_word_count,
          declared_segment_count, calculated_segment_count, segmentation_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [orderId, order.script.text, segmentation.normalizedText, order.script.speakerMode,
          order.script.declaredWordCount, segmentation.wordCount, order.script.declaredSegmentCount,
          segmentation.segments.length, segmentation.version]
      );
      const scriptId = scriptResult.rows[0]!.id;

      const jobNumber = publicJobNumber();
      const initialStatus = order.uploads.length > 0 ? "ASSET_INGESTION_PENDING" : "READY_FOR_PRODUCTION";
      const jobResult = await client.query<{ id: string }>(
        `INSERT INTO app.jobs (public_job_number, order_id, status) VALUES ($1,$2,$3) RETURNING id`,
        [jobNumber, orderId, initialStatus]
      );
      const jobId = jobResult.rows[0]!.id;

      for (const segment of segmentation.segments) {
        await client.query(
          `INSERT INTO app.script_segments
           (script_id, job_id, sequence, speaker_code, segment_text, word_count, character_count, checksum_sha256)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [scriptId, jobId, segment.sequence, segment.speakerCode ?? null, segment.text,
            segment.wordCount, segment.characterCount, segment.checksumSha256]
        );
      }

      const deleteAfter = new Date(Date.now() + retentionDays * 86_400_000);
      for (const asset of order.uploads) {
        await client.query(
          `INSERT INTO app.uploaded_assets
           (order_id, job_id, external_asset_id, asset_type, original_file_name, declared_content_type,
            size_bytes, source_url_encrypted, checksum_sha256, retention_policy_days, delete_after)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [orderId, jobId, asset.externalAssetId, asset.assetType, asset.fileName, asset.contentType,
            asset.sizeBytes, encryptSourceUrl(asset.temporaryUrl), asset.checksumSha256 ?? null, retentionDays, deleteAfter]
        );
      }

      await client.query(
        `INSERT INTO app.job_status_history (job_id, previous_status, new_status, changed_by_type, changed_by_id)
         VALUES ($1,NULL,$2,'system','paid-order-intake')`,
        [jobId, initialStatus]
      );
      await client.query(
        `INSERT INTO app.audit_events
         (event_type, actor_type, actor_id, resource_type, resource_id, safe_metadata)
         VALUES ('paid_order.accepted','system','wordpress-intake','job',$1,$2::jsonb)`,
        [jobId, JSON.stringify({ externalOrderId: order.order.externalOrderId, eventId: order.eventId })]
      );

      await client.query("COMMIT");
      return { duplicate: false, orderId, jobId, publicJobNumber: jobNumber };
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }
}
