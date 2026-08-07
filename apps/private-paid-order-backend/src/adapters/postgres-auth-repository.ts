import type { Pool } from "pg";
import type { AuthRepository, OperatorSession, OperatorUser } from "../auth/repository.js";

export class PostgresAuthRepository implements AuthRepository {
  constructor(private readonly pool: Pool) {}

  async findUserByEmail(emailNormalized: string): Promise<OperatorUser | null> {
    const result = await this.pool.query<{
      id: string; email: string; password_hash: string; role: "ADMIN" | "OPERATOR";
      status: "ACTIVE" | "DISABLED"; failed_login_count: number; locked_until: Date | null;
    }>(
      `SELECT id,email,password_hash,role,status,failed_login_count,locked_until
       FROM app.users WHERE email_normalized=$1 LIMIT 1`,
      [emailNormalized]
    );
    const row = result.rows[0];
    return row ? {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      role: row.role,
      status: row.status,
      failedLoginCount: row.failed_login_count,
      lockedUntil: row.locked_until
    } : null;
  }

  async recordFailedLogin(userId: string, maxAttempts: number, lockMinutes: number): Promise<void> {
    await this.pool.query(
      `UPDATE app.users
       SET failed_login_count=failed_login_count+1,
           locked_until=CASE WHEN failed_login_count+1 >= $2 THEN now() + ($3 * interval '1 minute') ELSE locked_until END,
           updated_at=now()
       WHERE id=$1`,
      [userId, maxAttempts, lockMinutes]
    );
  }

  async recordSuccessfulLogin(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE app.users
       SET failed_login_count=0, locked_until=NULL, last_login_at=now(), updated_at=now()
       WHERE id=$1`,
      [userId]
    );
  }

  async createSession(input: { userId: string; tokenHash: string; csrfTokenHash: string; expiresAt: Date; ipHash?: string | undefined; userAgentHash?: string | undefined }): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO app.operator_sessions(user_id,token_hash,csrf_token_hash,expires_at,ip_hash,user_agent_hash)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [input.userId, input.tokenHash, input.csrfTokenHash, input.expiresAt, input.ipHash ?? null, input.userAgentHash ?? null]
    );
    return result.rows[0]!.id;
  }

  async findSession(tokenHash: string): Promise<OperatorSession | null> {
    const result = await this.pool.query<{
      id: string; user_id: string; email: string; role: "ADMIN" | "OPERATOR"; status: "ACTIVE" | "DISABLED";
      csrf_token_hash: string; expires_at: Date; revoked_at: Date | null;
    }>(
      `SELECT s.id,s.user_id,u.email,u.role,u.status,s.csrf_token_hash,s.expires_at,s.revoked_at
       FROM app.operator_sessions s JOIN app.users u ON u.id=s.user_id
       WHERE s.token_hash=$1 LIMIT 1`,
      [tokenHash]
    );
    const row = result.rows[0];
    return row ? {
      id: row.id,
      userId: row.user_id,
      email: row.email,
      role: row.role,
      status: row.status,
      csrfTokenHash: row.csrf_token_hash,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at
    } : null;
  }

  async revokeSession(tokenHash: string): Promise<void> {
    await this.pool.query(`UPDATE app.operator_sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL`, [tokenHash]);
  }

  async touchSession(sessionId: string): Promise<void> {
    await this.pool.query(`UPDATE app.operator_sessions SET last_seen_at=now() WHERE id=$1`, [sessionId]);
  }

  async recordAudit(input: { eventType: string; actorType: string; actorId?: string | undefined; resourceType: string; resourceId: string; requestId?: string | undefined; safeMetadata?: Record<string, unknown> | undefined }): Promise<void> {
    await this.pool.query(
      `INSERT INTO app.audit_events(event_type,actor_type,actor_id,resource_type,resource_id,request_id,safe_metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [input.eventType, input.actorType, input.actorId ?? null, input.resourceType, input.resourceId, input.requestId ?? null, JSON.stringify(input.safeMetadata ?? {})]
    );
  }
}
