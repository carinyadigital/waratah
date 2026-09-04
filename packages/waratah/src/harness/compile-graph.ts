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
import { WaratahError, isWaratahError, type WaratahErrorCode } from '../shared/errors.js';
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

export interface StepBudget {
  steps: number;
}

export interface ToolTranscriptLine {
  readonly timestamp: string;
  readonly type: 'tool';
  readonly name: string;
  readonly status: 'started' | 'succeeded' | 'failed';
  readonly errorCode?: WaratahErrorCode;
}

export interface HarnessRuntime {
  readonly modelAdapter: ModelAdapter;
  readonly files: SessionFilesystem;
  readonly sessionId: SessionId;
  readonly turnId: TurnId;
  readonly budget: StepBudget;
  readonly signal?: AbortSignal;
  readonly limits?: HarnessLimits;
  readonly toolExecutor?: ToolExecutorOptions;
  readonly onTranscript?: (line: ToolTranscriptLine) => Promise<void>;
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
    const steps = consumeStep(runtime, limits.maxSteps);

    const descriptors: ToolDescriptor[] = boundTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: {},
    }));
    const signal = runtime.signal ?? new AbortController().signal;
    const result = await withSignal(
      signal,
      completeModel(runtime.modelAdapter, {
        model: definition.model,
        messages: state.messages,
        tools: descriptors,
        signal,
      }),
      modelFailed,
    );

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
    const signal = runtime.signal ?? new AbortController().signal;
    const messages: ModelMessage[] = [];
    let steps = runtime.budget.steps;

    for (const call of state.pendingToolCalls) {
      steps = consumeStep(runtime, limits.maxSteps);
      await recordToolTranscript(runtime, call.name, 'started');

      try {
        const output = await withSignal(
          signal,
          executor.execute(call, {
            sessionId: runtime.sessionId,
            turnId: runtime.turnId,
            stepId: createStepId(),
            files: runtime.files,
            signal,
          }),
          toolFailed,
        );
        const serialized = serializeToolResult(output);
        if (Buffer.byteLength(serialized, 'utf8') > limits.maxToolResultBytes) {
          throw new WaratahError(
            'PAYLOAD_LIMIT_EXCEEDED',
            'The payload exceeds the allowed size. Reduce the payload and try again.',
          );
        }
        messages.push({ role: 'tool', toolCallId: call.id, content: serialized });
        await recordToolTranscript(runtime, call.name, 'succeeded');
      } catch (error) {
        const failure = isWaratahError(error)
          ? error
          : new WaratahError(
              'TOOL_EXECUTION_FAILED',
              'The tool could not complete. Check the tool configuration and retry only when the operation is safe.',
            );
        await recordToolTranscript(runtime, call.name, 'failed', failure.code);
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

async function recordToolTranscript(
  runtime: HarnessRuntime,
  name: string,
  status: ToolTranscriptLine['status'],
  errorCode?: WaratahErrorCode,
): Promise<void> {
  if (runtime.onTranscript === undefined) {
    return;
  }
  try {
    await runtime.onTranscript({
      timestamp: new Date().toISOString(),
      type: 'tool',
      name,
      status,
      ...(errorCode === undefined ? {} : { errorCode }),
    });
  } catch {
    // Inspection files must not change the session outcome.
  }
}

function consumeStep(runtime: HarnessRuntime, maxSteps: number): number {
  runtime.budget.steps += 1;
  if (runtime.budget.steps > maxSteps) {
    throw new WaratahError(
      'STEP_LIMIT_EXCEEDED',
      'The session exceeded its step limit and was stopped. Reduce the work or split it into smaller tasks.',
    );
  }
  return runtime.budget.steps;
}

function withSignal<T>(
  signal: AbortSignal,
  operation: Promise<T>,
  onAbort: () => WaratahError,
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(onAbort());
  }

  let abort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    abort = () => reject(onAbort());
    signal.addEventListener('abort', abort, { once: true });
  });
  return Promise.race([operation, aborted]).finally(() => {
    if (abort !== undefined) {
      signal.removeEventListener('abort', abort);
    }
  });
}

function modelFailed(): WaratahError {
  return new WaratahError(
    'MODEL_ERROR',
    'The model request failed. Check provider availability and configuration before retrying.',
  );
}

function toolFailed(): WaratahError {
  return new WaratahError(
    'TOOL_EXECUTION_FAILED',
    'The tool could not complete. Check the tool configuration and retry only when the operation is safe.',
  );
}

function runtimeFromConfig(config: unknown): HarnessRuntime | undefined {
  if (!isRecord(config) || !isRecord(config.configurable)) {
    return undefined;
  }
  const configurable = config.configurable;
  if (
    !('modelAdapter' in configurable) ||
    !('files' in configurable) ||
    !isRecord(configurable.budget) ||
    typeof configurable.budget.steps !== 'number' ||
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
