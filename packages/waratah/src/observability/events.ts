import type { WaratahErrorCode } from '../shared/errors.js';

export const TRACE_EVENT_FIELDS = [
  'timestamp',
  'name',
  'kind',
  'phase',
  'status',
  'durationMs',
  'sessionId',
  'turnId',
  'stepId',
  'parentStepId',
  'agentName',
  'toolName',
  'model',
  'inputBytes',
  'outputBytes',
  'errorCode',
  'retryCount',
  'promptTokens',
  'completionTokens',
  'slackMessageId',
  'pullRequestUrl',
] as const;

export type TraceEventField = (typeof TRACE_EVENT_FIELDS)[number];

export type TraceEventKind = 'session' | 'turn' | 'model' | 'tool' | 'subagent';
export type TraceEventPhase = 'start' | 'terminal';
export type TraceEventStatus = 'started' | 'succeeded' | 'failed';

export interface TraceEvent {
  readonly timestamp: string;
  readonly name: string;
  readonly kind?: TraceEventKind;
  readonly phase?: TraceEventPhase;
  readonly status?: TraceEventStatus;
  readonly durationMs?: number;
  readonly sessionId?: string;
  readonly turnId?: string;
  readonly stepId?: string;
  readonly parentStepId?: string;
  readonly agentName?: string;
  readonly toolName?: string;
  readonly model?: string;
  readonly inputBytes?: number;
  readonly outputBytes?: number;
  readonly errorCode?: WaratahErrorCode;
  readonly retryCount?: number;
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly slackMessageId?: string;
  readonly pullRequestUrl?: string;
}

const SECRET_PATTERN =
  /Bearer\s+\S+|xox[baprs]-[\w-]+|ghp_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9]+/gi;

const NUMERIC_FIELDS = new Set<TraceEventField>([
  'durationMs',
  'inputBytes',
  'outputBytes',
  'retryCount',
  'promptTokens',
  'completionTokens',
]);

/** Copies allowlisted fields only and drops secret-shaped string values. */
export function sanitizeTraceEvent(input: unknown): TraceEvent | undefined {
  if (!isRecord(input) || typeof input.timestamp !== 'string' || typeof input.name !== 'string') {
    return undefined;
  }

  const event: Record<string, unknown> = {};
  for (const field of TRACE_EVENT_FIELDS) {
    if (!Object.hasOwn(input, field)) {
      continue;
    }
    const value = sanitizeField(field, input[field]);
    if (value !== undefined) {
      event[field] = value;
    }
  }

  if (typeof event.timestamp !== 'string' || typeof event.name !== 'string') {
    return undefined;
  }
  return event as unknown as TraceEvent;
}

function sanitizeField(field: TraceEventField, value: unknown): unknown {
  if (NUMERIC_FIELDS.has(field)) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== 'string' || value.length === 0) {
    return undefined;
  }
  if (SECRET_PATTERN.test(value)) {
    SECRET_PATTERN.lastIndex = 0;
    return undefined;
  }
  SECRET_PATTERN.lastIndex = 0;
  return value;
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
