export type OperatorRole = "ADMIN" | "OPERATOR";

export interface OperatorUser {
  id: string;
  email: string;
  passwordHash: string;
  role: OperatorRole;
  status: "ACTIVE" | "DISABLED";
  failedLoginCount: number;
  lockedUntil: Date | null;
}

export interface OperatorSession {
  id: string;
  userId: string;
  email: string;
  role: OperatorRole;
  status: "ACTIVE" | "DISABLED";
  csrfTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface AuthRepository {
  findUserByEmail(emailNormalized: string): Promise<OperatorUser | null>;
  recordFailedLogin(userId: string, maxAttempts: number, lockMinutes: number): Promise<void>;
  recordSuccessfulLogin(userId: string): Promise<void>;
  createSession(input: { userId: string; tokenHash: string; csrfTokenHash: string; expiresAt: Date; ipHash?: string | undefined; userAgentHash?: string | undefined }): Promise<string>;
  findSession(tokenHash: string): Promise<OperatorSession | null>;
  revokeSession(tokenHash: string): Promise<void>;
  touchSession(sessionId: string): Promise<void>;
  recordAudit(input: { eventType: string; actorType: string; actorId?: string | undefined; resourceType: string; resourceId: string; requestId?: string | undefined; safeMetadata?: Record<string, unknown> | undefined }): Promise<void>;
}
