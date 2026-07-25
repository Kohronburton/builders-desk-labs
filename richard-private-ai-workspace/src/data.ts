import type { AuditEvent, SourceRecord } from "./types";

export const records: SourceRecord[] = [
  {
    id: "src-1042",
    title: "Mobile capture architecture",
    kind: "conversation",
    owner: "Workspace Owner",
    importedAt: "Today, 09:18",
    checksum: "90f2…a12c",
    chunks: 18,
    state: "verified",
    summary: "Android-first capture using CameraX, resilient uploads, and explicit media-to-session linkage.",
    tags: ["android", "camera", "phase-2"],
  },
  {
    id: "src-1041",
    title: "Data restoration decisions",
    kind: "document",
    owner: "Workspace Owner",
    importedAt: "Today, 08:42",
    checksum: "18bc…9e07",
    chunks: 32,
    state: "verified",
    summary: "Original records remain authoritative; summaries are versioned derivatives with source references.",
    tags: ["integrity", "postgresql", "migration"],
  },
  {
    id: "src-1040",
    title: "Live routing requirements",
    kind: "conversation",
    owner: "Workspace Owner",
    importedAt: "Yesterday, 16:06",
    checksum: "d3ae…41bd",
    chunks: 24,
    state: "review",
    summary: "Routes media to Gemini, an operator, or archive based on session policy and urgency.",
    tags: ["routing", "multimedia", "phase-3"],
  },
  {
    id: "src-1039",
    title: "Operator cockpit sketch",
    kind: "image",
    owner: "Workspace Owner",
    importedAt: "Yesterday, 15:51",
    checksum: "f10d…73aa",
    chunks: 4,
    state: "verified",
    summary: "Workspace status, source traceability, active sessions, and routing health in one view.",
    tags: ["operator", "dashboard", "ux"],
  },
];

export const events: AuditEvent[] = [
  { id: "evt-1", time: "09:19:04", actor: "Ingestion worker", action: "Checksum verified", target: "src-1042", result: "success" },
  { id: "evt-2", time: "09:18:58", actor: "Embedding worker", action: "Created 18 vectors", target: "src-1042", result: "success" },
  { id: "evt-3", time: "09:18:51", actor: "Policy engine", action: "PII scan passed", target: "src-1042", result: "success" },
  { id: "evt-4", time: "08:43:11", actor: "Integrity monitor", action: "Duplicate isolated", target: "src-1041-copy", result: "warning" },
];
