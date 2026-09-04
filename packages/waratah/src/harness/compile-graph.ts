import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

import { mergeFiles } from '../context/files-channel.js';
import type { Checkpointer } from '../session/checkpointer.js';
import type { AgentDefinition, WaratahCompiledGraph } from '../shared/contracts.js';

const AgentState = Annotation.Root({
  messages: Annotation<unknown[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  files: Annotation<Record<string, string>>({
    reducer: (left, right) => mergeFiles(left, right),
    default: () => ({}),
  }),
});

export interface CompileGraphOptions {
  readonly checkpointer?: Checkpointer;
}

/**
 * Compiles an authored definition to a LangGraph. Phase 1 S1 ships a stub
 * graph with a files channel; model and tool nodes are wired in a later slice.
 */
export function compileGraph(
  _definition: AgentDefinition,
  options: CompileGraphOptions = {},
): WaratahCompiledGraph {
  return new StateGraph(AgentState)
    .addNode('noop', (state) => state)
    .addEdge(START, 'noop')
    .addEdge('noop', END)
    .compile({ checkpointer: options.checkpointer }) as unknown as WaratahCompiledGraph;
}
