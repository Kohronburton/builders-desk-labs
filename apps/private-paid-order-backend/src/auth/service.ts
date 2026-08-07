import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { AuthRepository, OperatorSession } from "./repository.js";
import { verifyPassword } from "./password.js";

const DUMMY_PASSWORD_HASH = "scrypt$v1$32768$8$1$bWF5bmUtZHVtbXktc2FsdA$VOqZiPRzEFYan4DpK31WwuWr9RyMQZjcfR8d1sOhwM553k3gxbnRorSfDJm0K4I4Mmi8oHTUYqXcVxqNbEHB9Q";

export interface AuthPolicy {
  sessionTtlSeconds: number;
  maxFailedAttempts: number;
  lockMinutes: number;
  auditHashKey: Buffer;
}

export interface RequestIdentityContext {
  ip?: string | undefined;
  userAgent?: string | undefined;
  requestId?: string | undefined;
}

export interface LoginSuccess {
  sessionToken: string;
  csrfToken: string;
  expiresAt: Date;
  user: { id: string; email: string; role: "ADMIN" | "OPERATOR" };
}

export interface AuthenticatedOperator {
  sessionId: string;
  userId: string;
  email: string;
  role: "ADMIN" | "OPERATOR";
  csrfTokenHash: string;
  expiresAt: Date;
}

function token(): string {
  return randomBytes(32).toString("base64url");
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function privacyHash(value: string | undefined, key: Buffer): string | undefined {
  return value ? createHmac("sha256", key).update(value).digest("hex") : undefined;
}

function safeHashEqual(expectedHex: string, rawValue: string): boolean {
  const actualHex = hash(rawValue);
  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(actualHex, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export class AuthService {
  constructor(private readonly repository: AuthRepository, private readonly policy: AuthPolicy) {
    if (policy.auditHashKey.length < 32) throw new Error("AUDIT_HASH_KEY_TOO_SHORT");
  }

  async login(email: string, password: string, context: RequestIdentityContext = {}): Promise<LoginSuccess | null> {
    const emailNormalized = email.trim().toLowerCase();
    const user = await this.repository.findUserByEmail(emailNormalized);
    const passwordMatches = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    const now = new Date();
    const locked = Boolean(user?.lockedUntil && user.lockedUntil > now);
    const eligible = Boolean(user && user.status === "ACTIVE" && !locked && passwordMatches);

    if (!eligible) {
      if (user?.status === "ACTIVE" && !locked && !passwordMatches) {
        await this.repository.recordFailedLogin(user.id, this.policy.maxFailedAttempts, this.policy.lockMinutes);
      }
      await this.repository.recordAudit({
        eventType: "operator.login_failed",
        actorType: "operator",
        actorId: user?.id,
        resourceType: "auth",
        resourceId: "login",
        requestId: context.requestId,
        safeMetadata: {
          ipHash: privacyHash(context.ip, this.policy.auditHashKey),
          userAgentHash: privacyHash(context.userAgent, this.policy.auditHashKey)
        }
      });
      return null;
    }

    const activeUser = user!;
    await this.repository.recordSuccessfulLogin(activeUser.id);
    const sessionToken = token();
    const csrfToken = token();
    const expiresAt = new Date(Date.now() + this.policy.sessionTtlSeconds * 1000);
    await this.repository.createSession({
      userId: activeUser.id,
      tokenHash: hash(sessionToken),
      csrfTokenHash: hash(csrfToken),
      expiresAt,
      ipHash: privacyHash(context.ip, this.policy.auditHashKey),
      userAgentHash: privacyHash(context.userAgent, this.policy.auditHashKey)
    });
    await this.repository.recordAudit({
      eventType: "operator.login_succeeded",
      actorType: "operator",
      actorId: activeUser.id,
      resourceType: "auth",
      resourceId: "login",
      requestId: context.requestId
    });
    return {
      sessionToken,
      csrfToken,
      expiresAt,
      user: { id: activeUser.id, email: activeUser.email, role: activeUser.role }
    };
  }

  async authenticate(sessionToken: string | undefined): Promise<AuthenticatedOperator | null> {
    if (!sessionToken) return null;
    const session = await this.repository.findSession(hash(sessionToken));
    if (!this.isUsableSession(session)) return null;
    await this.repository.touchSession(session.id);
    return {
      sessionId: session.id,
      userId: session.userId,
      email: session.email,
      role: session.role,
      csrfTokenHash: session.csrfTokenHash,
      expiresAt: session.expiresAt
    };
  }

  verifyCsrf(operator: AuthenticatedOperator, csrfToken: string | undefined): boolean {
    return Boolean(csrfToken && safeHashEqual(operator.csrfTokenHash, csrfToken));
  }

  async auditAction(operator: AuthenticatedOperator, input: { eventType: string; resourceType: string; resourceId: string; requestId?: string | undefined; safeMetadata?: Record<string, unknown> | undefined }): Promise<void> {
    await this.repository.recordAudit({
      ...input,
      actorType: "operator",
      actorId: operator.userId
    });
  }

  async logout(sessionToken: string | undefined, operator: AuthenticatedOperator | null, requestId?: string): Promise<void> {
    if (!sessionToken) return;
    await this.repository.revokeSession(hash(sessionToken));
    if (operator) {
      await this.repository.recordAudit({
        eventType: "operator.logout",
        actorType: "operator",
        actorId: operator.userId,
        resourceType: "auth",
        resourceId: operator.sessionId,
        requestId
      });
    }
  }

  private isUsableSession(session: OperatorSession | null): session is OperatorSession {
    return Boolean(session && session.status === "ACTIVE" && !session.revokedAt && session.expiresAt.getTime() > Date.now());
  }
}
