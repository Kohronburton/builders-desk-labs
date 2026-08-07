import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { AuthRepository, OperatorSession, OperatorUser } from "../src/auth/repository.js";
import { hashPassword, verifyPassword } from "../src/auth/password.js";
import { AuthService } from "../src/auth/service.js";

class MemoryAuthRepository implements AuthRepository {
  user: OperatorUser | null = null;
  sessions = new Map<string, OperatorSession>();
  audits: string[] = [];
  failed = 0;

  async findUserByEmail(email: string): Promise<OperatorUser | null> { return this.user?.email.toLowerCase() === email ? this.user : null; }
  async recordFailedLogin(): Promise<void> { this.failed += 1; if (this.user) this.user.failedLoginCount += 1; }
  async recordSuccessfulLogin(): Promise<void> { if (this.user) { this.user.failedLoginCount = 0; this.user.lockedUntil = null; } }
  async createSession(input: Parameters<AuthRepository["createSession"]>[0]): Promise<string> {
    const id = `session-${this.sessions.size + 1}`;
    if (!this.user) throw new Error("missing user");
    this.sessions.set(input.tokenHash, {
      id, userId: input.userId, email: this.user.email, role: this.user.role, status: this.user.status,
      csrfTokenHash: input.csrfTokenHash, expiresAt: input.expiresAt, revokedAt: null
    });
    return id;
  }
  async findSession(tokenHash: string): Promise<OperatorSession | null> { return this.sessions.get(tokenHash) ?? null; }
  async revokeSession(tokenHash: string): Promise<void> { const session = this.sessions.get(tokenHash); if (session) session.revokedAt = new Date(); }
  async touchSession(): Promise<void> {}
  async recordAudit(input: Parameters<AuthRepository["recordAudit"]>[0]): Promise<void> { this.audits.push(input.eventType); }
}

async function setup() {
  const repository = new MemoryAuthRepository();
  repository.user = {
    id: "11111111-1111-4111-8111-111111111111",
    email: "operator@example.test",
    passwordHash: await hashPassword("Correct Horse Battery Staple 42"),
    role: "OPERATOR",
    status: "ACTIVE",
    failedLoginCount: 0,
    lockedUntil: null
  };
  const auth = new AuthService(repository, {
    sessionTtlSeconds: 3600,
    maxFailedAttempts: 5,
    lockMinutes: 15,
    auditHashKey: randomBytes(32)
  });
  return { auth, repository };
}

test("scrypt password hashes verify and do not contain plaintext", async () => {
  const password = "Correct Horse Battery Staple 42";
  const encoded = await hashPassword(password);
  assert.equal(encoded.includes(password), false);
  assert.equal(await verifyPassword(password, encoded), true);
  assert.equal(await verifyPassword("wrong password", encoded), false);
});

test("successful login creates opaque session and CSRF tokens", async () => {
  const { auth, repository } = await setup();
  const login = await auth.login("OPERATOR@example.test", "Correct Horse Battery Staple 42");
  assert.ok(login);
  assert.ok(login.sessionToken.length >= 40);
  assert.ok(login.csrfToken.length >= 40);
  assert.equal(repository.sessions.has(login.sessionToken), false, "raw session token must not be stored");
  const operator = await auth.authenticate(login.sessionToken);
  assert.equal(operator?.email, "operator@example.test");
  assert.equal(auth.verifyCsrf(operator!, login.csrfToken), true);
  assert.equal(auth.verifyCsrf(operator!, "wrong"), false);
});

test("bad password records failure and creates no session", async () => {
  const { auth, repository } = await setup();
  const login = await auth.login("operator@example.test", "definitely wrong");
  assert.equal(login, null);
  assert.equal(repository.failed, 1);
  assert.equal(repository.sessions.size, 0);
  assert.ok(repository.audits.includes("operator.login_failed"));
});

test("locked account is refused even with correct password", async () => {
  const { auth, repository } = await setup();
  repository.user!.lockedUntil = new Date(Date.now() + 60_000);
  const login = await auth.login("operator@example.test", "Correct Horse Battery Staple 42");
  assert.equal(login, null);
  assert.equal(repository.sessions.size, 0);
});

test("logout revokes the server-side session", async () => {
  const { auth } = await setup();
  const login = await auth.login("operator@example.test", "Correct Horse Battery Staple 42");
  const operator = await auth.authenticate(login!.sessionToken);
  assert.ok(operator);
  await auth.logout(login!.sessionToken, operator);
  assert.equal(await auth.authenticate(login!.sessionToken), null);
});
