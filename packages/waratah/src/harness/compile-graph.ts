import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

import type { AgentDefinition, WaratahCompiledGraph } from '../shared/contracts.js';

const AgentState = Annotation.Root({
  messages: Annotation<unknown[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  files: Annotation<Record<string, string>>({
    reducer: (left, right) => ({ ...left, ...right }),
    default: () => ({}),
  }),
});

/**
 * Compiles an authored definition to a LangGraph. Phase 1 S1 ships a stub
 * graph with a files channel; model and tool nodes are wired in a later slice.
 */
export function compileGraph(_definition: AgentDefinition): WaratahCompiledGraph {
  return new StateGraph(AgentState)
    .addNode('noop', (state) => state)
    .addEdge(START, 'noop')
    .addEdge('noop', END)
    .compile() as unknown as WaratahCompiledGraph;
}
