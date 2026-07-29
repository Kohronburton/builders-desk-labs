export type Scenario =
  | 'success'
  | 'timeout-once'
  | 'rate-limit-once'
  | 'invalid-ai-once'
  | 'duplicate'
  | 'permanent-failure';

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type Category = 'webhook' | 'api' | 'llm' | 'automation' | 'unknown';

export interface WorkflowInput {
  requestId: string;
  sessionId: string;
  message: string;
  scenario: Scenario;
  metadata?: Record<string, unknown>;
}

export interface DiagnosticResult {
  service: string;
  healthy: boolean;
  signal: string;
  latencyMs: number;
  checkedAt: string;
}

export interface AgentDecision {
  category: Category;
  severity: Severity;
  summary: string;
  probableCause: string;
  recommendedActions: string[];
  requiresHuman: boolean;
  confidence: number;
}

export interface WorkflowResult extends AgentDecision {
  requestId: string;
  sessionId: string;
  status: 'resolved' | 'needs_human';
  duplicate: boolean;
  diagnostics: DiagnosticResult;
  telemetry: {
    diagnosticsAttempts: number;
    aiAttempts: number;
    durationMs: number;
    aiMode: string;
  };
  completedAt: string;
}

export interface ExecutionRecord {
  requestId: string;
  sessionId: string;
  status: 'processing' | 'completed' | 'failed';
  scenario: Scenario;
  input: WorkflowInput;
  result: WorkflowResult | null;
  error: { message: string; code?: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiProvider {
  readonly mode: string;
  generate(input: WorkflowInput, diagnostic: DiagnosticResult, attempt: number): Promise<unknown>;
}

export interface DiagnosticsProvider {
  run(input: WorkflowInput, attempt: number): Promise<DiagnosticResult>;
}
