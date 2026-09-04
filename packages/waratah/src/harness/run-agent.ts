import { loadSessionInstructions, loadSessionStartContent } from '../memory/load.js';
import { createToolTraceHook, type JsonlSink } from '../observability/jsonl-sink.js';
import type { FilesystemSessionStore, SessionTranscriptLine } from '../session/filesystem-store.js';
import type { AgentDefinition, ModelMessage, SessionFilesystem } from '../shared/contracts.js';
import { isWaratahError } from '../shared/errors.js';
import type { SessionId, TurnId } from '../shared/ids.js';
import { createTaskTool } from '../subagents/task-tool.js';
import type { ToolExecutorOptions } from '../tools/executor.js';
import {
  compileGraph,
  type CompileGraphOptions,
  type HarnessRuntime,
  type StepBudget,
} from './compile-graph.js';
import { DEFAULT_LIMITS, type HarnessLimits } from './limits.js';
import type { ModelAdapter } from './model-adapter.js';

export interface RunAgentOptions {
  readonly agent: AgentDefinition;
  readonly agentFile: string;
  readonly projectRoot: string;
  readonly sessionId: SessionId;
  readonly turnId: TurnId;
  readonly files: SessionFilesystem;
  readonly modelAdapter: ModelAdapter;
  readonly input: string;
  readonly checkpointer?: CompileGraphOptions['checkpointer'];
  readonly extraTools?: CompileGraphOptions['extraTools'];
  readonly limits?: HarnessLimits;
  readonly signal?: AbortSignal;
  readonly findingPath?: string;
  readonly budget?: StepBudget;
  readonly toolExecutor?: ToolExecutorOptions;
  readonly sink?: JsonlSink;
  readonly sessionStore?: FilesystemSessionStore;
}

export interface RunAgentResult {
  readonly content: string;
  readonly steps: number;
}

/** Loads session context and invokes the compiled graph for one turn. */
export async function runAgent(options: RunAgentOptions): Promise<RunAgentResult> {
  const limits = options.limits ?? DEFAULT_LIMITS;
  const budget = options.budget ?? { steps: 0 };
  const toolExecutor = bindToolExecutor(options);
  const extraTools = [
    ...(options.extraTools ?? []),
    ...(options.agent.kind === 'lead'
      ? [
          createTaskTool({
            parentAgent: options.agent,
            parentAgentFile: options.agentFile,
            projectRoot: options.projectRoot,
            modelAdapter: options.modelAdapter,
            budget,
            limits,
            toolExecutor,
          }),
        ]
      : []),
  ];
  const graph = compileGraph(options.agent, {
    checkpointer: options.checkpointer,
    extraTools,
  });
  const messages = await loadAgentMessages(options);
  const runtime: HarnessRuntime = {
    modelAdapter: options.modelAdapter,
    files: options.files,
    sessionId: options.sessionId,
    turnId: options.turnId,
    budget,
    signal: options.signal,
    limits,
    toolExecutor,
    onTranscript:
      options.sessionStore === undefined
        ? undefined
        : (line) => options.sessionStore!.appendTranscript(options.sessionId, line),
  };
  const startedAt = Date.now();
  await emit(options.sink, {
    timestamp: new Date().toISOString(),
    name: 'session.start',
    kind: 'session',
    phase: 'start',
    status: 'started',
    sessionId: options.sessionId,
    turnId: options.turnId,
    agentName: options.agent.name,
  });
  await recordSession(options, {
    timestamp: new Date().toISOString(),
    type: 'system',
    event: 'started',
  });
  await updateSessionStatus(options, 'running');
  try {
    const result = await graph.invoke(
      { messages },
      {
        configurable: {
          thread_id: options.sessionId,
          ...runtime,
        },
      },
    );
    await emit(options.sink, {
      timestamp: new Date().toISOString(),
      name: 'session.terminal',
      kind: 'session',
      phase: 'terminal',
      status: 'succeeded',
      durationMs: Date.now() - startedAt,
      sessionId: options.sessionId,
      turnId: options.turnId,
      agentName: options.agent.name,
    });
    const state = result as { readonly content?: string };
    const content = state.content ?? '';
    await recordSession(options, {
      timestamp: new Date().toISOString(),
      type: 'assistant',
      content,
    });
    await recordSession(options, {
      timestamp: new Date().toISOString(),
      type: 'system',
      event: 'succeeded',
    });
    await updateSessionStatus(options, 'succeeded');
    return {
      content,
      steps: budget.steps,
    };
  } catch (error) {
    await emit(options.sink, {
      timestamp: new Date().toISOString(),
      name: 'session.terminal',
      kind: 'session',
      phase: 'terminal',
      status: 'failed',
      durationMs: Date.now() - startedAt,
      sessionId: options.sessionId,
      turnId: options.turnId,
      agentName: options.agent.name,
      errorCode: isWaratahError(error) ? error.code : undefined,
    });
    await recordSession(options, {
      timestamp: new Date().toISOString(),
      type: 'system',
      event: 'failed',
      ...(isWaratahError(error) ? { errorCode: error.code } : {}),
    });
    await updateSessionStatus(
      options,
      'failed',
      isWaratahError(error) ? error.code : undefined,
    );
    throw error;
  }
}

async function recordSession(
  options: RunAgentOptions,
  line: SessionTranscriptLine,
): Promise<void> {
  if (options.sessionStore === undefined) {
    return;
  }
  try {
    await options.sessionStore.appendTranscript(options.sessionId, line);
  } catch {
    // Inspection files must not change the session outcome.
  }
}

async function updateSessionStatus(
  options: RunAgentOptions,
  status: 'running' | 'succeeded' | 'failed',
  errorCode?: Parameters<FilesystemSessionStore['updateStatus']>[2],
): Promise<void> {
  if (options.sessionStore === undefined) {
    return;
  }
  try {
    await options.sessionStore.updateStatus(options.sessionId, status, errorCode);
  } catch {
    // Inspection files must not change the session outcome.
  }
}

function bindToolExecutor(options: RunAgentOptions): ToolExecutorOptions | undefined {
  if (options.toolExecutor?.trace !== undefined || options.sink === undefined) {
    return options.toolExecutor;
  }
  return {
    ...options.toolExecutor,
    trace: createToolTraceHook(options.sink),
  };
}

async function emit(sink: JsonlSink | undefined, event: unknown): Promise<void> {
  if (sink === undefined) {
    return;
  }
  try {
    await Promise.all([sink.writeTrace(event), sink.writeLog(event)]);
  } catch {
    // Inspection files must not change the session outcome.
  }
}

export async function loadAgentMessages(options: {
  readonly agent: AgentDefinition;
  readonly agentFile: string;
  readonly projectRoot: string;
  readonly input: string;
  readonly findingPath?: string;
}): Promise<ModelMessage[]> {
  const [content, instructions] = await Promise.all([
    loadSessionStartContent({
      definition: options.agent,
      agentFile: options.agentFile,
      projectRoot: options.projectRoot,
    }),
    loadSessionInstructions({
      definition: options.agent,
      agentFile: options.agentFile,
      projectRoot: options.projectRoot,
    }),
  ]);
  const messages: ModelMessage[] = [];
  for (const file of instructions) {
    messages.push({ role: 'system', content: `Instructions (${file.path}):\n${file.content}` });
  }
  for (const file of content.agents) {
    messages.push({
      role: 'system',
      content: `Project guidance (${file.path}):\n${file.content}`,
    });
  }
  for (const file of content.memory) {
    messages.push({ role: 'system', content: `Memory (${file.path}):\n${file.content}` });
  }
  if (content.skills.length > 0) {
    messages.push({
      role: 'system',
      content: `Available skills:\n${content.skills.map((file) => `- ${file.path}`).join('\n')}`,
    });
  }
  if (options.findingPath !== undefined) {
    messages.push({
      role: 'system',
      content: `Write the required final finding to ${options.findingPath}.`,
    });
  }
  messages.push({ role: 'user', content: options.input });
  return messages;
}
