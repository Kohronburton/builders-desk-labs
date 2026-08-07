import type { IntakeRepository, WebhookAttemptFinish, WebhookAttemptStart, AcceptedOrderResult } from "../src/intake/repository.js";

export class MemoryNonceStore {
  private readonly seen = new Set<string>();
  async claim(nonce: string): Promise<boolean> {
    if (this.seen.has(nonce)) return false;
    this.seen.add(nonce);
    return true;
  }
}

export class MemoryIntakeRepository implements IntakeRepository {
  readonly starts: WebhookAttemptStart[] = [];
  readonly finishes: WebhookAttemptFinish[] = [];
  readonly acceptedKeys = new Map<string, AcceptedOrderResult>();
  acceptCalls = 0;

  async recordAttemptStart(attempt: WebhookAttemptStart): Promise<void> {
    this.starts.push(attempt);
  }

  async recordAttemptFinish(attempt: WebhookAttemptFinish): Promise<void> {
    this.finishes.push(attempt);
  }

  async acceptPaidOrder(input: Parameters<IntakeRepository["acceptPaidOrder"]>[0]): Promise<AcceptedOrderResult> {
    this.acceptCalls += 1;
    const existing = this.acceptedKeys.get(input.idempotencyKey);
    if (existing) return { ...existing, duplicate: true };
    const created: AcceptedOrderResult = {
      duplicate: false,
      orderId: `order-${input.order.order.externalOrderId}`,
      jobId: `job-${input.order.order.externalOrderId}`,
      publicJobNumber: `JOB-${input.order.order.externalOrderId}`
    };
    this.acceptedKeys.set(input.idempotencyKey, created);
    return created;
  }
}
