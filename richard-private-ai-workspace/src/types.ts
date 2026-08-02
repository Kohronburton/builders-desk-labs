export type IntegrityState = "verified" | "review" | "blocked";

export interface SourceRecord {
  id: string;
  title: string;
  kind: "conversation" | "document" | "image";
  owner: string;
  importedAt: string;
  checksum: string;
  chunks: number;
  state: IntegrityState;
  summary: string;
  tags: string[];
}

export interface AuditEvent {
  id: string;
  time: string;
  actor: string;
  action: string;
  target: string;
  result: "success" | "warning";
}

export interface RetrievalResult {
  sourceId: string;
  title: string;
  excerpt: string;
  score: number;
}
