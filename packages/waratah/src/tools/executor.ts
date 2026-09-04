import {
  allowOnlyApprovalPolicy,
  type ApprovalPolicy,
  type ApprovalRequest,
} from '../approval/policy.js';
import type {
  AgentDefinition,
  ModelToolCall,
  SessionFilesystem,
  ToolDefinition,
  ToolExecutionContext,
} from '../shared/contracts.js';
import { WaratahError, isWaratahError, type WaratahErrorCode } from '../shared/errors.js';
import type { SessionId, StepId, TurnId } from '../shared/ids.js';

export interface ToolExecutionResources {
  readonly sessionId: SessionId;
  readonly turnId: TurnId;
  readonly stepId: StepId;
  readonly files: SessionFilesystem;
  readonly signal: AbortSignal;
}

export interface ToolCallMetadata {
  readonly callId: string;
  readonly sessionId: SessionId;
  readonly turnId: TurnId;
  readonly stepId: StepId;
  readonly agentName: string;
  readonly toolName: string;
}

export type ToolCallTerminalMetadata =
  | (ToolCallMetadata & { readonly status: 'succeeded' })
  | (ToolCallMetadata & {
      readonly status: 'failed';
      readonly errorCode: WaratahErrorCode;
    });

/** Receives secret-safe tool lifecycle metadata without raw inputs or outputs. */
export interface ToolTraceHook {
  started(metadata: ToolCallMetadata): void;
  finished(metadata: ToolCallTerminalMetadata): void;
}

/** Enforces an invocation budget immediately before policy evaluation. */
export interface SideEffectBudgetHook {
  beforeToolExecution(metadata: ToolCallMetadata): void | Promise<void>;
}

export interface ToolExecutorOptions {
  readonly approvalPolicy?: ApprovalPolicy;
  readonly trace?: ToolTraceHook;
  readonly sideEffectBudget?: SideEffectBudgetHook;
}

/**
 * Executes calls only against the immutable tool set bound to one agent.
 *
 * The public invocation method accepts a tool name but never a tool
 * implementation, so callers cannot substitute an undeclared executor.
 */
export class ToolExecutor {
  private readonly agentName: string;
  private readonly tools: ReadonlyMap<string, ToolDefinition>;
  private readonly approvalPolicy: ApprovalPolicy;
  private readonly trace: ToolTraceHook | undefined;
  private readonly sideEffectBudget: SideEffectBudgetHook | undefined;

  constructor(
    agent: Pick<AgentDefinition, 'name' | 'tools'>,
    options: ToolExecutorOptions = {},
  ) {
    this.agentName = agent.name;
    this.tools = bindTools(agent.tools);
    this.approvalPolicy = options.approvalPolicy ?? allowOnlyApprovalPolicy;
    this.trace = options.trace;
    this.sideEffectBudget = options.sideEffectBudget;
  }

  async execute(call: ModelToolCall, resources: ToolExecutionResources): Promise<unknown> {
    const metadata: ToolCallMetadata = {
      callId: call.id,
      sessionId: resources.sessionId,
      turnId: resources.turnId,
      stepId: resources.stepId,
      agentName: this.agentName,
      toolName: call.name,
    };
    notifyObserver(() => this.trace?.started(metadata));

    try {
      const tool = this.tools.get(call.name);
      if (tool === undefined) {
        throw new WaratahError(
          'UNKNOWN_TOOL',
          'The requested tool is not available to this agent. Use one of the tools declared for the agent.',
        );
      }

      if (resources.signal.aborted) {
        throw toolExecutionFailed();
      }

      const input = parseToolInput(tool, call.arguments);
      await this.sideEffectBudget?.beforeToolExecution(metadata);

      const approvalRequest: ApprovalRequest = {
        ...metadata,
        input,
      };
      const decision = await this.approvalPolicy.evaluate(approvalRequest);
      if (!decision.allowed) {
        throw toolExecutionFailed();
      }

      const context: ToolExecutionContext = {
        ...resources,
        agentName: this.agentName,
      };
      // Cancellation remains cooperative: racing arbitrary user code would report
      // completion while an untracked tool and any side effects could continue running.
      const output = await tool.execute(input, context);
      if (resources.signal.aborted) {
        throw toolExecutionFailed();
      }
      notifyObserver(() => this.trace?.finished({ ...metadata, status: 'succeeded' }));
      return output;
    } catch (error) {
      const failure = normalizeToolFailure(error);
      notifyObserver(() => {
        this.trace?.finished({
          ...metadata,
          status: 'failed',
          errorCode: failure.code,
        });
      });
      throw failure;
    }
  }
}

function notifyObserver(notification: () => void): void {
  // Observer failures are discarded so they cannot change the operation observed.
  try {
    const settled: unknown = notification();
    if (typeof (settled as PromiseLike<void> | undefined)?.then === 'function') {
      void Promise.resolve(settled as PromiseLike<void>).catch(() => {});
    }
  } catch {
    // Discarded for the reason above.
  }
}

function bindTools(tools: readonly ToolDefinition[]): ReadonlyMap<string, ToolDefinition> {
  const bound = new Map<string, ToolDefinition>();

  for (const tool of tools) {
    if (bound.has(tool.name)) {
      throw new WaratahError(
        'INVALID_AGENT',
        'The agent definition is invalid. Correct the reported definition fields and try again.',
      );
    }
    bound.set(tool.name, tool);
  }

  return bound;
}

function parseToolInput(tool: ToolDefinition, input: unknown): unknown {
  try {
    return tool.inputSchema.parse(input);
  } catch {
    throw new WaratahError(
      'TOOL_INPUT_INVALID',
      'The tool input is invalid. Correct the input to match the tool schema and try again.',
    );
  }
}

function normalizeToolFailure(error: unknown): WaratahError {
  if (isWaratahError(error)) {
    return error;
  }

  return toolExecutionFailed();
}

function toolExecutionFailed(): WaratahError {
  return new WaratahError(
    'TOOL_EXECUTION_FAILED',
    'The tool could not complete. Check the tool configuration and retry only when the operation is safe.',
  );
}
