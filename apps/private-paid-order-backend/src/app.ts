import { createHash } from "node:crypto";
import Fastify from "fastify";
import helmet from "@fastify/helmet";
import { JsonConsoleLogger, runHealthChecks, type MayneLogger } from "@mayne/foundation-core";
import { paidOrderSchema, fieldErrors } from "./contracts/paid-order.js";
import type { Segmenter } from "./domain/segmentation.js";
import type { IntakeRepository, WebhookAttemptFinish } from "./intake/repository.js";
import { verifyWebhook, type KeyResolver, type NonceStore, type WebhookHeaders } from "./security/webhook.js";

export interface AppOptions {
  repository: IntakeRepository;
  nonceStore: NonceStore;
  keyResolver: KeyResolver;
  segmenter: Segmenter;
  encryptSourceUrl: (url: string) => string;
  retentionDays: 30 | 60 | 90;
  webhookToleranceSeconds: number;
  webhookNonceTtlSeconds: number;
  logger?: MayneLogger;
  healthChecks?: Readonly<Record<string, () => Promise<{ ok: boolean; detail?: string }>>>;
}

function header(value: string | string[] | undefined): string {
  return Array.isArray(value) ? "" : value ?? "";
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function buildApp(options: AppOptions) {
  const logger = options.logger ?? new JsonConsoleLogger();
  const app = Fastify({
    logger: false,
    bodyLimit: 1_048_576,
    requestIdHeader: false
  });
  await app.register(helmet, { contentSecurityPolicy: false });

  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_request, body, done) => {
    done(null, body);
  });

  app.get("/health/live", async () => ({ status: "ok" }));
  app.get("/health/ready", async (_request, reply) => {
    const result = await runHealthChecks(options.healthChecks ?? {});
    if (result.status === "unhealthy") reply.code(503);
    return result;
  });

  app.post("/api/v1/webhooks/wordpress/paid-orders", async (request, reply) => {
    const startedAt = Date.now();
    const requestId = String(request.id);
    const rawBody = Buffer.isBuffer(request.body) ? request.body : Buffer.from("");
    const headers: WebhookHeaders = {
      keyId: header(request.headers["x-webhook-key-id"]),
      timestamp: header(request.headers["x-webhook-timestamp"]),
      nonce: header(request.headers["x-webhook-nonce"]),
      signature: header(request.headers["x-webhook-signature"]),
      idempotencyKey: header(request.headers["x-idempotency-key"])
    };
    const payloadHash = sha256(rawBody);
    const safeHeaders = {
      "content-type": header(request.headers["content-type"]),
      "user-agent": header(request.headers["user-agent"]),
      "x-webhook-key-id": headers.keyId,
      "x-webhook-timestamp": headers.timestamp,
      "x-idempotency-key": headers.idempotencyKey
    };

    try {
      await options.repository.recordAttemptStart({
        requestId,
        receivedAt: new Date(),
        sourceIp: request.ip,
        keyId: headers.keyId || undefined,
        nonceHash: headers.nonce ? sha256(headers.nonce) : undefined,
        idempotencyKey: headers.idempotencyKey || undefined,
        payloadHash,
        safeHeaders
      });
    } catch (error) {
      logger.log("error", "webhook attempt could not be recorded", { requestId, error: error instanceof Error ? error.message : "unknown" });
      return reply.code(503).send({ success: false, requestId, error: { code: "INTAKE_UNAVAILABLE", message: "Paid-order intake is temporarily unavailable." } });
    }

    const finish = async (fields: Omit<WebhookAttemptFinish, "requestId" | "processingDurationMs">) => {
      try {
        await options.repository.recordAttemptFinish({ ...fields, requestId, processingDurationMs: Date.now() - startedAt });
      } catch (error) {
        logger.log("error", "webhook attempt finalization failed", { requestId, error: error instanceof Error ? error.message : "unknown" });
      }
    };

    const guard = await verifyWebhook(headers, rawBody, options.nonceStore, options.keyResolver, {
      toleranceSeconds: options.webhookToleranceSeconds,
      nonceTtlSeconds: options.webhookNonceTtlSeconds
    });
    if (!guard.ok) {
      const replay = guard.failure === "REPLAYED_NONCE";
      const expired = guard.failure === "EXPIRED_TIMESTAMP";
      const badHeaders = guard.failure === "BAD_HEADERS";
      const statusCode = replay ? 409 : badHeaders ? 400 : 401;
      await finish({
        signatureStatus: guard.failure === "BAD_SIGNATURE" || guard.failure === "UNKNOWN_KEY" ? "rejected" : "not_checked",
        timestampStatus: expired ? "rejected" : "checked",
        replayStatus: replay ? "rejected" : "not_replayed",
        validationStatus: "not_checked",
        finalStatus: "rejected",
        httpResponseCode: statusCode,
        failureCode: guard.failure
      });
      const code = replay ? "WEBHOOK_REPLAYED" : expired ? "WEBHOOK_EXPIRED" : badHeaders ? "WEBHOOK_HEADERS_INVALID" : "WEBHOOK_AUTH_FAILED";
      return reply.code(statusCode).send({ success: false, requestId, error: { code, message: "Webhook request was refused." } });
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody.toString("utf8"));
    } catch {
      await finish({
        signatureStatus: "verified", timestampStatus: "valid", replayStatus: "clear", validationStatus: "rejected",
        finalStatus: "rejected", httpResponseCode: 422, failureCode: "INVALID_JSON",
        failureDetails: [{ path: "$", code: "INVALID_JSON", message: "Request body must be valid JSON." }]
      });
      return reply.code(422).send({
        success: false,
        requestId,
        error: { code: "PAYLOAD_VALIDATION_FAILED", message: "One or more fields are invalid.", fields: [{ path: "$", code: "INVALID_JSON", message: "Request body must be valid JSON." }] }
      });
    }

    const parsed = paidOrderSchema.safeParse(json);
    if (!parsed.success) {
      const errors = fieldErrors(parsed.error);
      await finish({
        signatureStatus: "verified", timestampStatus: "valid", replayStatus: "clear", validationStatus: "rejected",
        finalStatus: "rejected", httpResponseCode: 422, failureCode: "PAYLOAD_VALIDATION_FAILED", failureDetails: errors
      });
      return reply.code(422).send({ success: false, requestId, error: { code: "PAYLOAD_VALIDATION_FAILED", message: "One or more fields are invalid.", fields: errors } });
    }

    const order = parsed.data;
    const segmentation = options.segmenter.segment(order);
    const parityErrors = [] as Array<{ path: string; code: string; message: string }>;
    if (segmentation.wordCount !== order.script.declaredWordCount) {
      parityErrors.push({ path: "script.declaredWordCount", code: "WORD_COUNT_MISMATCH", message: `Website declared ${order.script.declaredWordCount}; backend calculated ${segmentation.wordCount}.` });
    }
    if (segmentation.segments.length !== order.script.declaredSegmentCount) {
      parityErrors.push({ path: "script.declaredSegmentCount", code: "SEGMENT_COUNT_MISMATCH", message: `Website declared ${order.script.declaredSegmentCount}; backend calculated ${segmentation.segments.length}.` });
    }
    if (parityErrors.length > 0) {
      await finish({
        externalOrderId: order.order.externalOrderId,
        signatureStatus: "verified", timestampStatus: "valid", replayStatus: "clear", validationStatus: "rejected",
        finalStatus: "rejected", httpResponseCode: 422, failureCode: "PRICING_PARITY_FAILED", failureDetails: parityErrors
      });
      return reply.code(422).send({ success: false, requestId, error: { code: "PAYLOAD_VALIDATION_FAILED", message: "Website/backend pricing parity failed.", fields: parityErrors } });
    }

    try {
      const accepted = await options.repository.acceptPaidOrder({
        order,
        idempotencyKey: headers.idempotencyKey,
        payloadHash,
        segmentation,
        encryptSourceUrl: options.encryptSourceUrl,
        retentionDays: options.retentionDays
      });
      const statusCode = accepted.duplicate ? 200 : 201;
      await finish({
        externalOrderId: order.order.externalOrderId,
        signatureStatus: "verified", timestampStatus: "valid", replayStatus: "clear", validationStatus: "valid",
        finalStatus: accepted.duplicate ? "duplicate" : "accepted", httpResponseCode: statusCode
      });
      return reply.code(statusCode).send({
        success: true,
        requestId,
        orderId: accepted.orderId,
        jobId: accepted.jobId,
        publicJobNumber: accepted.publicJobNumber,
        status: "accepted",
        duplicate: accepted.duplicate
      });
    } catch (error) {
      const conflict = error instanceof Error && error.message === "IDEMPOTENCY_CONFLICT";
      const statusCode = conflict ? 409 : 503;
      await finish({
        externalOrderId: order.order.externalOrderId,
        signatureStatus: "verified", timestampStatus: "valid", replayStatus: "clear", validationStatus: "valid",
        finalStatus: "failed", httpResponseCode: statusCode, failureCode: conflict ? "IDEMPOTENCY_CONFLICT" : "ORDER_ACCEPT_FAILED"
      });
      logger.log("error", "paid order acceptance failed", { requestId, externalOrderId: order.order.externalOrderId, error: error instanceof Error ? error.message : "unknown" });
      return reply.code(statusCode).send({ success: false, requestId, error: { code: conflict ? "IDEMPOTENCY_CONFLICT" : "INTAKE_UNAVAILABLE", message: conflict ? "Idempotency key conflicts with another order." : "Paid-order intake is temporarily unavailable." } });
    }
  });

  return app;
}
