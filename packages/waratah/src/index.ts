export type { WaratahErrorCode, HarnessLimits } from './shared/errors.js';
export { WaratahError, DEFAULT_LIMITS, isWaratahError } from './shared/errors.js';

export { createAgent, defineTool } from './agent/create-agent.js';
export { compileAgent as compile } from './compiler/compile-agent.js';
export { defineCronChannel } from './channel/cron.js';

export type {
  AgentDefinition,
  AgentKind,
  CompiledAgent,
  CreateAgentInput,
  Schema,
  SessionEntry,
  SessionFilesystem,
  ToolDefinition,
  ToolExecutionContext,
  WaratahManifest,
} from './shared/contracts.js';

export type { SessionId, SessionPath, StepId, TurnId } from './shared/ids.js';

