export type JobStatus =
  | "RECEIVED"
  | "VALIDATED"
  | "ASSET_INGESTION_PENDING"
  | "READY_FOR_PRODUCTION"
  | "ON_HOLD"
  | "REQUIRES_REVIEW"
  | "CANCELLED"
  | "FAILED";

export interface OperatorJobSummary {
  jobId: string;
  publicJobNumber: string;
  status: JobStatus;
  externalOrderId: string;
  customerName: string;
  packageCode: string;
  templateCode: string;
  performanceStyleCode: string;
  voiceOptionCode: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OperatorJobDetail extends OperatorJobSummary {
  email: string;
  phone: string | null;
  currency: string;
  totalAmount: number;
  paidAt: Date;
  peopleCount: number;
  productBranch: string;
  customerNotes: string | null;
  scriptText: string;
  declaredWordCount: number;
  calculatedWordCount: number;
  declaredSegmentCount: number;
  calculatedSegmentCount: number;
  segmentationVersion: string;
}

export interface OperatorSegment {
  id: string;
  sequence: number;
  speakerCode: string | null;
  text: string;
  wordCount: number;
  characterCount: number;
  status: string;
}

export interface OperatorAsset {
  id: string;
  assetType: string;
  originalFileName: string;
  contentType: string | null;
  sizeBytes: number;
  ingestionStatus: string;
  retentionDays: number | null;
  deleteAfter: Date | null;
}

export interface AssetAccessRecord {
  id: string;
  jobId: string;
  storageKey: string;
  ingestionStatus: string;
}

export interface OperatorRepository {
  listJobs(input: { status?: JobStatus | undefined; query?: string | undefined; limit: number; offset: number }): Promise<OperatorJobSummary[]>;
  getJob(jobId: string): Promise<OperatorJobDetail | null>;
  getSegments(jobId: string): Promise<OperatorSegment[]>;
  getAssets(jobId: string): Promise<OperatorAsset[]>;
  getAssetForAccess(assetId: string): Promise<AssetAccessRecord | null>;
  updateStatus(input: { jobId: string; expectedCurrentStatus: JobStatus; newStatus: JobStatus; reason?: string | undefined; operatorId: string }): Promise<boolean>;
}

const OPERATOR_TRANSITIONS: Readonly<Record<JobStatus, readonly JobStatus[]>> = Object.freeze({
  RECEIVED: ["REQUIRES_REVIEW", "CANCELLED"],
  VALIDATED: ["REQUIRES_REVIEW", "CANCELLED"],
  ASSET_INGESTION_PENDING: ["ON_HOLD", "REQUIRES_REVIEW", "CANCELLED"],
  READY_FOR_PRODUCTION: ["ON_HOLD", "REQUIRES_REVIEW", "CANCELLED"],
  ON_HOLD: ["READY_FOR_PRODUCTION", "REQUIRES_REVIEW", "CANCELLED"],
  REQUIRES_REVIEW: ["READY_FOR_PRODUCTION", "ON_HOLD", "CANCELLED"],
  CANCELLED: [],
  FAILED: ["REQUIRES_REVIEW"]
});

export function canOperatorTransition(from: JobStatus, to: JobStatus): boolean {
  return OPERATOR_TRANSITIONS[from].includes(to);
}
