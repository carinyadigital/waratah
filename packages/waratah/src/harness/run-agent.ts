import { loadSessionInstructions, loadSessionStartContent } from '../memory/load.js';
import type { AgentDefinition, ModelMessage, SessionFilesystem } from '../shared/contracts.js';
import type { SessionId, TurnId } from '../shared/ids.js';
import { compileGraph, type CompileGraphOptions, type HarnessRuntime } from './compile-graph.js';
import type { HarnessLimits } from './limits.js';
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
}

export interface RunAgentResult {
  readonly content: string;
  readonly steps: number;
}

/** Loads session context and invokes the compiled graph for one turn. */
export async function runAgent(options: RunAgentOptions): Promise<RunAgentResult> {
  const graph = compileGraph(options.agent, {
    checkpointer: options.checkpointer,
    extraTools: options.extraTools,
  });
  const messages = await loadAgentMessages(options);
  const runtime: HarnessRuntime = {
    modelAdapter: options.modelAdapter,
    files: options.files,
    sessionId: options.sessionId,
    turnId: options.turnId,
    signal: options.signal,
    limits: options.limits,
  };
  const result = await graph.invoke(
    { messages },
    {
      configurable: {
        thread_id: options.sessionId,
        ...runtime,
      },
    },
  );
  const state = result as { readonly content?: string; readonly steps?: number };
  return {
    content: state.content ?? '',
    steps: state.steps ?? 0,
  };
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
