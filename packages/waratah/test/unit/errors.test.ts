import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LIMITS,
  WaratahError,
  isWaratahError,
  type WaratahErrorCode,
} from '../../src/shared/errors.js';

const EXPECTED_ERROR_CODES: WaratahErrorCode[] = [
  'INVALID_AGENT',
  'INVALID_CHANNEL_SCOPE',
  'INVALID_SESSION_PATH',
  'DUPLICATE_DELIVERY',
  'MODEL_ERROR',
  'UNKNOWN_TOOL',
  'TOOL_INPUT_INVALID',
  'TOOL_EXECUTION_FAILED',
  'SUBAGENT_NOT_DECLARED',
  'SUBAGENT_FINDING_MISSING',
  'STEP_LIMIT_EXCEEDED',
  'PAYLOAD_LIMIT_EXCEEDED',
  'SESSION_STORE_ERROR',
];

describe('errors', () => {
  it('defines default harness limits', () => {
    expect(DEFAULT_LIMITS).toEqual({
      maxSteps: 20,
      maxToolCallsPerStep: 4,
      maxToolResultBytes: 256_000,
      maxFindingBytes: 32_000,
    });
  });

  it('creates typed errors with optional details', () => {
    const error = new WaratahError('INVALID_SESSION_PATH', 'Path escapes session root', {
      path: '/session/s1/../secret.md',
    });

    expect(error.code).toBe('INVALID_SESSION_PATH');
    expect(error.message).toBe('Path escapes session root');
    expect(error.details).toEqual({ path: '/session/s1/../secret.md' });
    expect(isWaratahError(error)).toBe(true);
    expect(isWaratahError(new Error('nope'))).toBe(false);
  });

  it.each(EXPECTED_ERROR_CODES)('exports the %s error code from the public barrel', async (code) => {
    const barrel = await import('../../src/index.js');

    expect(barrel.WaratahError).toBeDefined();
    expect(barrel.DEFAULT_LIMITS).toBeDefined();

    const error = new barrel.WaratahError(code, 'test');
    expect(error.code).toBe(code);
  });
});
