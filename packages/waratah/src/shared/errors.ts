export type WaratahErrorCode =
  | 'INVALID_AGENT'
  | 'INVALID_CHANNEL_SCOPE'
  | 'INVALID_SESSION_PATH'
  | 'DUPLICATE_DELIVERY'
  | 'MODEL_ERROR'
  | 'UNKNOWN_TOOL'
  | 'TOOL_INPUT_INVALID'
  | 'TOOL_EXECUTION_FAILED'
  | 'SUBAGENT_NOT_DECLARED'
  | 'SUBAGENT_FINDING_MISSING'
  | 'STEP_LIMIT_EXCEEDED'
  | 'PAYLOAD_LIMIT_EXCEEDED'
  | 'SESSION_STORE_ERROR';

export interface HarnessLimits {
  readonly maxSteps: number;
  readonly maxToolCallsPerStep: number;
  readonly maxToolResultBytes: number;
  readonly maxFindingBytes: number;
}

export const PHASE_1_LIMITS: HarnessLimits = {
  maxSteps: 20,
  maxToolCallsPerStep: 4,
  maxToolResultBytes: 256_000,
  maxFindingBytes: 32_000,
};

export class WaratahError extends Error {
  readonly code: WaratahErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    code: WaratahErrorCode,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'WaratahError';
    this.code = code;
    this.details = details;
  }
}

export const isWaratahError = (value: unknown): value is WaratahError =>
  value instanceof WaratahError;
