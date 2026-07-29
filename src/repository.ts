import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ExecutionRecord, WorkflowInput, WorkflowResult } from './types.ts';

interface Row {
  request_id: string;
  session_id: string;
  status: ExecutionRecord['status'];
  scenario: ExecutionRecord['scenario'];
  input_json: string;
  result_json: string | null;
  error_json: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRecord(row: Row): ExecutionRecord {
  return {
    requestId: row.request_id,
    sessionId: row.session_id,
    status: row.status,
    scenario: row.scenario,
    input: JSON.parse(row.input_json),
    result: row.result_json ? JSON.parse(row.result_json) : null,
    error: row.error_json ? JSON.parse(row.error_json) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ExecutionRepository {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS execution_logs (
        request_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('processing','completed','failed')),
        scenario TEXT NOT NULL,
        input_json TEXT NOT NULL,
        result_json TEXT,
        error_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_execution_status_updated
      ON execution_logs(status, updated_at DESC);
    `);
  }

  get(requestId: string): ExecutionRecord | null {
    const row = this.db.prepare('SELECT * FROM execution_logs WHERE request_id = ?').get(requestId) as Row | undefined;
    return row ? rowToRecord(row) : null;
  }

  start(input: WorkflowInput): { created: boolean; existing: ExecutionRecord | null } {
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      INSERT OR IGNORE INTO execution_logs
      (request_id, session_id, status, scenario, input_json, created_at, updated_at)
      VALUES (?, ?, 'processing', ?, ?, ?, ?)
    `).run(input.requestId, input.sessionId, input.scenario, JSON.stringify(input), now, now);
    if (Number(result.changes) === 1) return { created: true, existing: null };
    return { created: false, existing: this.get(input.requestId) };
  }

  complete(requestId: string, result: WorkflowResult): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE execution_logs
      SET status = 'completed', result_json = ?, error_json = NULL, updated_at = ?
      WHERE request_id = ?
    `).run(JSON.stringify(result), now, requestId);
  }

  fail(requestId: string, error: { message: string; code?: string }): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE execution_logs
      SET status = 'failed', error_json = ?, updated_at = ?
      WHERE request_id = ?
    `).run(JSON.stringify(error), now, requestId);
  }

  logExternalFailure(event: Record<string, unknown>): string {
    const requestId = `n8n-error-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const input: WorkflowInput = {
      requestId,
      sessionId: String(event.executionId ?? 'unknown'),
      message: String(event.message ?? 'n8n workflow failure'),
      scenario: 'permanent-failure',
      metadata: event,
    };
    this.db.prepare(`
      INSERT INTO execution_logs
      (request_id, session_id, status, scenario, input_json, error_json, created_at, updated_at)
      VALUES (?, ?, 'failed', ?, ?, ?, ?, ?)
    `).run(requestId, input.sessionId, input.scenario, JSON.stringify(input), JSON.stringify({ message: input.message, code: 'N8N_ERROR' }), now, now);
    return requestId;
  }

  list(limit = 20): ExecutionRecord[] {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const rows = this.db.prepare('SELECT * FROM execution_logs ORDER BY updated_at DESC LIMIT ?').all(safeLimit) as unknown as Row[];
    return rows.map(rowToRecord);
  }

  counts(): Record<string, number> {
    const rows = this.db.prepare('SELECT status, COUNT(*) AS count FROM execution_logs GROUP BY status').all() as unknown as Array<{status: string; count: number}>;
    return Object.fromEntries(rows.map((row) => [row.status, Number(row.count)]));
  }

  close(): void {
    this.db.close();
  }
}
