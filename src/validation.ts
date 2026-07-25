import type { AgentDecision, Category, Scenario, Severity, WorkflowInput } from './types.ts';

const scenarios = new Set<Scenario>([
  'success',
  'timeout-once',
  'rate-limit-once',
  'invalid-ai-once',
  'duplicate',
  'permanent-failure',
]);
const categories = new Set<Category>(['webhook', 'api', 'llm', 'automation', 'unknown']);
const severities = new Set<Severity>(['low', 'medium', 'high', 'critical']);

export class ValidationError extends Error {
  readonly code = 'VALIDATION_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(source: Record<string, unknown>, field: string, min: number, max: number): string {
  const value = source[field];
  if (typeof value !== 'string') throw new ValidationError(`${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw new ValidationError(`${field} must be between ${min} and ${max} characters`);
  }
  return trimmed;
}

export function parseWorkflowInput(value: unknown): WorkflowInput {
  if (!isObject(value)) throw new ValidationError('request body must be a JSON object');
  const requestId = stringField(value, 'requestId', 3, 100);
  const sessionId = stringField(value, 'sessionId', 3, 100);
  const message = stringField(value, 'message', 5, 5000);
  const rawScenario = value.scenario ?? 'success';
  if (typeof rawScenario !== 'string' || !scenarios.has(rawScenario as Scenario)) {
    throw new ValidationError(`scenario must be one of: ${[...scenarios].join(', ')}`);
  }
  const metadata = value.metadata;
  if (metadata !== undefined && !isObject(metadata)) {
    throw new ValidationError('metadata must be a JSON object when provided');
  }
  return { requestId, sessionId, message, scenario: rawScenario as Scenario, metadata };
}

export function parseAgentDecision(value: unknown): AgentDecision {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new ValidationError('AI output is not valid JSON');
    }
  }
  if (!isObject(parsed)) throw new ValidationError('AI output must be an object');

  const category = parsed.category;
  const severity = parsed.severity;
  const summary = parsed.summary;
  const probableCause = parsed.probableCause;
  const recommendedActions = parsed.recommendedActions;
  const requiresHuman = parsed.requiresHuman;
  const confidence = parsed.confidence;

  if (typeof category !== 'string' || !categories.has(category as Category)) {
    throw new ValidationError('AI output category is invalid');
  }
  if (typeof severity !== 'string' || !severities.has(severity as Severity)) {
    throw new ValidationError('AI output severity is invalid');
  }
  if (typeof summary !== 'string' || summary.trim().length < 10 || summary.length > 500) {
    throw new ValidationError('AI output summary must be 10-500 characters');
  }
  if (typeof probableCause !== 'string' || probableCause.trim().length < 5 || probableCause.length > 800) {
    throw new ValidationError('AI output probableCause must be 5-800 characters');
  }
  if (!Array.isArray(recommendedActions) || recommendedActions.length < 1 || recommendedActions.length > 8) {
    throw new ValidationError('AI output recommendedActions must contain 1-8 items');
  }
  if (!recommendedActions.every((item) => typeof item === 'string' && item.trim().length >= 3)) {
    throw new ValidationError('AI output recommendedActions must contain non-empty strings');
  }
  if (typeof requiresHuman !== 'boolean') throw new ValidationError('AI output requiresHuman must be boolean');
  if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
    throw new ValidationError('AI output confidence must be between 0 and 1');
  }

  return {
    category: category as Category,
    severity: severity as Severity,
    summary: summary.trim(),
    probableCause: probableCause.trim(),
    recommendedActions: recommendedActions.map((item) => String(item).trim()),
    requiresHuman,
    confidence: Math.round(confidence * 100) / 100,
  };
}
