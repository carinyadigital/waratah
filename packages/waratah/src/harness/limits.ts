import { PHASE_1_LIMITS as PUBLIC_LIMITS, type HarnessLimits } from '../shared/errors.js';

export type { HarnessLimits };

export const PHASE_1_LIMITS = Object.freeze({
  ...PUBLIC_LIMITS,
  maxSessionMessageBytes: 64 * 1024,
  maxRequestBodyBytes: 80 * 1024,
  serverKeepAliveTimeoutMilliseconds: 5_000,
  serverMaxRequestsPerSocket: 100,
  serverShutdownGraceMilliseconds: 5_000,
});
