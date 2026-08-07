import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { createHash, randomBytes } from "node:crypto";
import type { AuthRepository, OperatorSession, OperatorUser } from "../src/auth/repository.js";
import { hashPassword } from "../src/auth/password.js";
import { AuthService } from "../src/auth/service.js";
import type { PrivateStorage } from "../src/assets/storage.js";
import type {
  AssetAccessRecord,
  JobStatus,
  OperatorAsset,
  OperatorJobDetail,
  OperatorJobSummary,
  OperatorRepository,
  OperatorSegment
} from "../src/operator/repository.js";
import { registerOperatorRoutes } from "../src/operator/routes.js";

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const ASSET_ID = "33333333-3333-4333-8333-333333333333";

class AuthRepo implements AuthRepository {
  user!: OperatorUser;
  sessions = new Map<string, OperatorSession>();
  audits: string[] = [];
  async findUserByEmail(email: string) { return this.user.email.toLowerCase() === email ? this.user : null; }
  async recordFailedLogin() {}
  async recordSuccessfulLogin() {}
  async createSession(input: Parameters<AuthRepository["createSession"]>[0]) {
    const id = "session-1";
    this.sessions.set(input.tokenHash, {
      id, userId: input.userId, email: this.user.email, role: this.user.role, status: this.user.status,
      csrfTokenHash: input.csrfTokenHash, expiresAt: input.expiresAt, revokedAt: null
    });
    return id;
  }
  async findSession(tokenHash: string) { return this.sessions.get(tokenHash) ?? null; }
  async revokeSession(tokenHash: string) { const session = this.sessions.get(tokenHash); if (session) session.revokedAt = new Date(); }
  async touchSession() {}
  async recordAudit(input: Parameters<AuthRepository["recordAudit"]>[0]) { this.audits.push(input.eventType); }
}

class OperatorRepo implements OperatorRepository {
  status: JobStatus = "READY_FOR_PRODUCTION";
  updates = 0;
  summary(): OperatorJobSummary {
    return {
      jobId: JOB_ID, publicJobNumber: "JOB-1001", status: this.status, externalOrderId: "1001",
      customerName: "Jane Smith", packageCode: "PACKAGE_STANDARD", templateCode: "SCENE_1",
      performanceStyleCode: "STYLE_1", voiceOptionCode: "VOICE_1", createdAt: new Date("2026-08-01T00:00:00Z"), updatedAt: new Date("2026-08-01T00:00:00Z")
    };
  }
  async listJobs(): Promise<OperatorJobSummary[]> { return [this.summary()]; }
  async getJob(): Promise<OperatorJobDetail> {
    return {
      ...this.summary(), email: "jane@example.com", phone: null, currency: "USD", totalAmount: 29900,
      paidAt: new Date("2026-08-01T00:00:00Z"), peopleCount: 2, productBranch: "NO_PRODUCT",
      customerNotes: null, scriptText: "Hello", declaredWordCount: 1, calculatedWordCount: 1,
      declaredSegmentCount: 1, calculatedSegmentCount: 1, segmentationVersion: "client-v1"
    };
  }
  async getSegments(): Promise<OperatorSegment[]> { return [{ id: "seg-1", sequence: 1, speakerCode: "HOST", text: "Hello", wordCount: 1, characterCount: 5, status: "READY" }]; }
  async getAssets(): Promise<OperatorAsset[]> { return [{ id: ASSET_ID, assetType: "FACE_IMAGE", originalFileName: "face.png", contentType: "image/png", sizeBytes: 100, ingestionStatus: "READY", retentionDays: 30, deleteAfter: new Date("2026-09-01T00:00:00Z") }]; }
  async getAssetForAccess(): Promise<AssetAccessRecord> { return { id: ASSET_ID, jobId: JOB_ID, storageKey: "customer-assets/job/face.png", ingestionStatus: "READY" }; }
  async updateStatus(input: Parameters<OperatorRepository["updateStatus"]>[0]) {
    if (this.status !== input.expectedCurrentStatus) return false;
    this.status = input.newStatus;
    this.updates += 1;
    return true;
  }
}

class Storage implements PrivateStorage {
  async put() {}
  async signedGet() { return "https://signed.example.test/private?sig=abc"; }
  async delete() {}
  async health() { return true; }
}

async function setup() {
  const authRepo = new AuthRepo();
  authRepo.user = {
    id: USER_ID, email: "operator@example.test", passwordHash: await hashPassword("Correct Horse Battery Staple 42"),
    role: "OPERATOR", status: "ACTIVE", failedLoginCount: 0, lockedUntil: null
  };
  const auth = new AuthService(authRepo, { sessionTtlSeconds: 3600, maxFailedAttempts: 5, lockMinutes: 15, auditHashKey: randomBytes(32) });
  const operatorRepo = new OperatorRepo();
  const app = Fastify();
  await registerOperatorRoutes(app, { auth, repository: operatorRepo, storage: new Storage(), signedUrlTtlSeconds: 600, secureCookies: false });
  await app.ready();
  const login = await auth.login("operator@example.test", "Correct Horse Battery Staple 42");
  const cookies = `mayne_session=${login!.sessionToken}; mayne_csrf=${login!.csrfToken}`;
  return { app, authRepo, operatorRepo, login: login!, cookies };
}

test("operator job API denies anonymous access", async (t) => {
  const { app } = await setup();
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/api/v1/jobs" });
  assert.equal(response.statusCode, 401);
});

test("operator job detail contains permitted data and no proprietary fields", async (t) => {
  const { app, cookies } = await setup();
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: `/api/v1/jobs/${JOB_ID}`, headers: { cookie: cookies } });
  assert.equal(response.statusCode, 200);
  const text = response.body;
  assert.ok(text.includes("PACKAGE_STANDARD"));
  for (const forbidden of ["internal.proprietary_content", "directorModule", "internalPrompt", "apiKey", "storageKey"]) {
    assert.equal(text.includes(forbidden), false, `response leaked forbidden marker ${forbidden}`);
  }
});

test("state change requires CSRF double-submit token", async (t) => {
  const { app, cookies } = await setup();
  t.after(() => app.close());
  const body = { currentStatus: "READY_FOR_PRODUCTION", newStatus: "ON_HOLD" };
  const denied = await app.inject({ method: "PATCH", url: `/api/v1/jobs/${JOB_ID}/status`, headers: { cookie: cookies }, payload: body });
  assert.equal(denied.statusCode, 403);
});

test("permitted status change succeeds with valid CSRF", async (t) => {
  const { app, cookies, login, operatorRepo } = await setup();
  t.after(() => app.close());
  const response = await app.inject({
    method: "PATCH", url: `/api/v1/jobs/${JOB_ID}/status`,
    headers: { cookie: cookies, "x-csrf-token": login.csrfToken },
    payload: { currentStatus: "READY_FOR_PRODUCTION", newStatus: "ON_HOLD", reason: "Waiting for review" }
  });
  assert.equal(response.statusCode, 200);
  assert.equal(operatorRepo.status, "ON_HOLD");
  assert.equal(operatorRepo.updates, 1);
});

test("disallowed status transition is refused", async (t) => {
  const { app, cookies, login } = await setup();
  t.after(() => app.close());
  const response = await app.inject({
    method: "PATCH", url: `/api/v1/jobs/${JOB_ID}/status`,
    headers: { cookie: cookies, "x-csrf-token": login.csrfToken },
    payload: { currentStatus: "READY_FOR_PRODUCTION", newStatus: "FAILED" }
  });
  assert.equal(response.statusCode, 409);
});

test("private asset link is short-lived and audited without exposing storage key", async (t) => {
  const { app, cookies, login, authRepo } = await setup();
  t.after(() => app.close());
  const response = await app.inject({
    method: "POST", url: `/api/v1/assets/${ASSET_ID}/access-link`,
    headers: { cookie: cookies, "x-csrf-token": login.csrfToken }
  });
  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(payload.expiresInSeconds, 600);
  assert.ok(payload.url.startsWith("https://signed.example.test/"));
  assert.equal(response.body.includes("customer-assets/job/face.png"), false);
  assert.ok(authRepo.audits.includes("asset.access_link_created"));
});

test("server-rendered operator page stays on safe projection", async (t) => {
  const { app, cookies } = await setup();
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/operator", headers: { cookie: cookies } });
  assert.equal(response.statusCode, 200);
  assert.ok(response.body.includes("JOB-1001"));
  assert.equal(response.body.includes("proprietary"), false);
  assert.equal(response.headers["x-robots-tag"], "noindex, nofollow");
});
