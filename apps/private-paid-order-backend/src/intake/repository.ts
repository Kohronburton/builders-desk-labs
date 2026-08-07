import type { PaidOrder } from "../contracts/paid-order.js";
import type { SegmentationResult } from "../domain/segmentation.js";

export interface WebhookAttemptStart {
  requestId: string;
  receivedAt: Date;
  sourceIp?: string;
  keyId?: string;
  nonceHash?: string;
  idempotencyKey?: string;
  payloadHash: string;
  safeHeaders: Readonly<Record<string, string>>;
}

export interface WebhookAttemptFinish {
  requestId: string;
  externalOrderId?: string;
  signatureStatus: string;
  timestampStatus: string;
  replayStatus: string;
  validationStatus: string;
  finalStatus: string;
  httpResponseCode: number;
  failureCode?: string;
  failureDetails?: unknown;
  processingDurationMs: number;
}

export interface AcceptedOrderResult {
  duplicate: boolean;
  orderId: string;
  jobId: string;
  publicJobNumber: string;
}

export interface IntakeRepository {
  recordAttemptStart(attempt: WebhookAttemptStart): Promise<void>;
  recordAttemptFinish(attempt: WebhookAttemptFinish): Promise<void>;
  acceptPaidOrder(input: {
    order: PaidOrder;
    idempotencyKey: string;
    payloadHash: string;
    segmentation: SegmentationResult;
    encryptSourceUrl: (url: string) => string;
    retentionDays: 30 | 60 | 90;
  }): Promise<AcceptedOrderResult>;
}
