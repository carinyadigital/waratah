export type { WaratahErrorCode, HarnessLimits } from './shared/errors.js';
export { WaratahError, PHASE_1_LIMITS, isWaratahError } from './shared/errors.js';

export { createAgent, defineTool } from './agent/create-agent.js';

export type {
  AgentDefinition,
  AgentKind,
  CreateAgentInput,
  Schema,
  SessionEntry,
  SessionFilesystem,
  ToolDefinition,
  ToolExecutionContext,
} from './shared/contracts.js';

export type { SessionId, SessionPath, StepId, TurnId } from './shared/ids.js';

