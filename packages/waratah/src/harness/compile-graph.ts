import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

import { mergeFiles } from '../context/files-channel.js';
import type { Checkpointer } from '../session/checkpointer.js';
import type {
  AgentDefinition,
  ModelMessage,
  ModelToolCall,
  SessionFilesystem,
  ToolDefinition,
  ToolDescriptor,
  WaratahCompiledGraph,
} from '../shared/contracts.js';
import { WaratahError, isWaratahError } from '../shared/errors.js';
import { createStepId, type SessionId, type TurnId } from '../shared/ids.js';
import { filesystemTools } from '../tools/filesystem.js';
import { ToolExecutor, type ToolExecutorOptions } from '../tools/executor.js';
import { PHASE_1_LIMITS, type HarnessLimits } from './limits.js';
import { completeModel, type ModelAdapter } from './model-adapter.js';

export interface CompileGraphOptions {
  readonly checkpointer?: Checkpointer;
  readonly extraTools?: readonly ToolDefinition[];
}

/**
 * Writes a first checkpoint without calling a model so POST /session can accept
 * a delivery before the harness turn runs.
 */
export function compileAcceptGraph(checkpointer?: Checkpointer): WaratahCompiledGraph {
  return new StateGraph(AgentState)
    .addNode('accept', (state) => state)
    .addEdge(START, 'accept')
    .addEdge('accept', END)
    .compile({ checkpointer }) as unknown as WaratahCompiledGraph;
}

export interface HarnessRuntime {
  readonly modelAdapter: ModelAdapter;
  readonly files: SessionFilesystem;
  readonly sessionId: SessionId;
  readonly turnId: TurnId;
  readonly signal?: AbortSignal;
  readonly limits?: HarnessLimits;
  readonly toolExecutor?: ToolExecutorOptions;
}

export interface HarnessState {
  readonly messages: ModelMessage[];
  readonly files: Record<string, string>;
  readonly pendingToolCalls: ModelToolCall[];
  readonly steps: number;
  readonly content: string;
}

const AgentState = Annotation.Root({
  messages: Annotation<ModelMessage[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  files: Annotation<Record<string, string>>({
    reducer: (left, right) => mergeFiles(left, right),
    default: () => ({}),
  }),
  pendingToolCalls: Annotation<ModelToolCall[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  steps: Annotation<number>({
    reducer: (_left, right) => right,
    default: () => 0,
  }),
  content: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => '',
  }),
});

/**
 * Assembles the lead or subagent graph: a model node, a tool node, and a files
 * channel. Runtime adapters are supplied through invoke config, not compile.
 */
export function compileGraph(
  definition: AgentDefinition,
  options: CompileGraphOptions = {},
): WaratahCompiledGraph {
  const boundTools: readonly ToolDefinition[] = [
    ...filesystemTools,
    ...definition.tools,
    ...(options.extraTools ?? []),
  ];

  const model = async (state: typeof AgentState.State, config: unknown) => {
    const runtime = requireRuntime(runtimeFromConfig(config));
    const limits = runtime.limits ?? PHASE_1_LIMITS;
    const steps = state.steps + 1;
    if (steps > limits.maxSteps) {
      throw new WaratahError(
        'STEP_LIMIT_EXCEEDED',
        'The session exceeded its step limit and was stopped. Reduce the work or split it into smaller tasks.',
      );
    }

    const descriptors: ToolDescriptor[] = boundTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: {},
    }));
    const result = await completeModel(runtime.modelAdapter, {
      model: definition.model,
      messages: state.messages,
      tools: descriptors,
      signal: runtime.signal ?? new AbortController().signal,
    });

    if (result.type === 'message') {
      return {
        messages: [{ role: 'assistant' as const, content: result.content }],
        pendingToolCalls: [],
        steps,
        content: result.content,
      };
    }

    if (result.toolCalls.length > limits.maxToolCallsPerStep) {
      throw new WaratahError(
        'PAYLOAD_LIMIT_EXCEEDED',
        'The payload exceeds the allowed size. Reduce the payload and try again.',
      );
    }

    return {
      messages: [
        {
          role: 'assistant' as const,
          content: '',
          toolCalls: result.toolCalls,
        },
      ],
      pendingToolCalls: [...result.toolCalls],
      steps,
    };
  };

  const tools = async (state: typeof AgentState.State, config: unknown) => {
    const runtime = requireRuntime(runtimeFromConfig(config));
    const limits = runtime.limits ?? PHASE_1_LIMITS;
    const executor = new ToolExecutor(
      { name: definition.name, tools: boundTools },
      runtime.toolExecutor,
    );
    const messages: ModelMessage[] = [];
    let steps = state.steps;

    for (const call of state.pendingToolCalls) {
      steps += 1;
      if (steps > limits.maxSteps) {
        throw new WaratahError(
          'STEP_LIMIT_EXCEEDED',
          'The session exceeded its step limit and was stopped. Reduce the work or split it into smaller tasks.',
        );
      }

      try {
        const output = await executor.execute(call, {
          sessionId: runtime.sessionId,
          turnId: runtime.turnId,
          stepId: createStepId(),
          files: runtime.files,
          signal: runtime.signal ?? new AbortController().signal,
        });
        const serialized = serializeToolResult(output);
        if (Buffer.byteLength(serialized, 'utf8') > limits.maxToolResultBytes) {
          throw new WaratahError(
            'PAYLOAD_LIMIT_EXCEEDED',
            'The payload exceeds the allowed size. Reduce the payload and try again.',
          );
        }
        messages.push({ role: 'tool', toolCallId: call.id, content: serialized });
      } catch (error) {
        const failure = isWaratahError(error)
          ? error
          : new WaratahError(
              'TOOL_EXECUTION_FAILED',
              'The tool could not complete. Check the tool configuration and retry only when the operation is safe.',
            );
        if (failure.code === 'UNKNOWN_TOOL' || failure.code === 'TOOL_INPUT_INVALID') {
          messages.push({
            role: 'tool',
            toolCallId: call.id,
            content: JSON.stringify({ error: { code: failure.code, message: failure.message } }),
          });
          continue;
        }
        throw failure;
      }
    }

    return {
      messages,
      pendingToolCalls: [],
      steps,
    };
  };

  return new StateGraph(AgentState)
    .addNode('model', model)
    .addNode('tools', tools)
    .addEdge(START, 'model')
    .addConditionalEdges('model', (state) =>
      state.pendingToolCalls.length > 0 ? 'tools' : END,
    )
    .addEdge('tools', 'model')
    .compile({ checkpointer: options.checkpointer }) as unknown as WaratahCompiledGraph;
}

function runtimeFromConfig(config: unknown): HarnessRuntime | undefined {
  if (!isRecord(config) || !isRecord(config.configurable)) {
    return undefined;
  }
  const configurable = config.configurable;
  if (
    !('modelAdapter' in configurable) ||
    !('files' in configurable) ||
    typeof configurable.sessionId !== 'string' ||
    typeof configurable.turnId !== 'string'
  ) {
    return undefined;
  }
  return configurable as unknown as HarnessRuntime;
}

function requireRuntime(runtime: HarnessRuntime | undefined): HarnessRuntime {
  if (runtime === undefined) {
    throw new WaratahError(
      'MODEL_ERROR',
      'The model request failed. Check provider availability and configuration before retrying.',
    );
  }
  return runtime;
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null;
}

function serializeToolResult(output: unknown): string {
  try {
    return JSON.stringify(output) ?? 'null';
  } catch {
    throw new WaratahError(
      'TOOL_EXECUTION_FAILED',
      'The tool could not complete. Check the tool configuration and retry only when the operation is safe.',
    );
  }
}
