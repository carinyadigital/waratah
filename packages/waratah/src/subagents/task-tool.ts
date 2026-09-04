import { dirname, join } from 'node:path';

import { defineTool } from '../agent/create-agent.js';
import type { StepBudget } from '../harness/compile-graph.js';
import type { HarnessLimits } from '../harness/limits.js';
import type { ModelAdapter } from '../harness/model-adapter.js';
import type { AgentDefinition, Schema, TaskToolInput } from '../shared/contracts.js';
import { WaratahError } from '../shared/errors.js';
import { BUILTIN_TOOL_NAMES } from '../tools/builtin-names.js';
import type { ToolExecutorOptions } from '../tools/executor.js';
import { runSubagent } from './run-subagent.js';

const taskInputSchema: Schema<TaskToolInput> = {
  parse(input) {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw new TypeError('Expected task input');
    }
    const value = input as Record<PropertyKey, unknown>;
    if (
      typeof value.subagent !== 'string' ||
      value.subagent.trim() === '' ||
      typeof value.instruction !== 'string' ||
      value.instruction.trim() === ''
    ) {
      throw new TypeError('Expected a subagent and instruction');
    }
    return { subagent: value.subagent, instruction: value.instruction };
  },
};

export interface CreateTaskToolOptions {
  readonly parentAgent: AgentDefinition;
  readonly parentAgentFile: string;
  readonly projectRoot: string;
  readonly modelAdapter: ModelAdapter;
  readonly budget: StepBudget;
  readonly limits: HarnessLimits;
  readonly toolExecutor?: ToolExecutorOptions;
}

export function createTaskTool(options: CreateTaskToolOptions) {
  return defineTool({
    name: BUILTIN_TOOL_NAMES.TASK,
    description: 'Run one declared subagent and return its canonical finding path and summary.',
    inputSchema: taskInputSchema,
    execute: async (input, context) => {
      const subagent = options.parentAgent.subagents.find(
        (candidate) => candidate.name === input.subagent,
      );
      if (subagent === undefined) {
        throw new WaratahError(
          'SUBAGENT_NOT_DECLARED',
          'The requested subagent is not declared on this agent. Use a subagent named in the agent definition.',
        );
      }

      return runSubagent({
        agent: subagent,
        agentFile: join(dirname(options.parentAgentFile), 'subagents', subagent.name, 'agent.ts'),
        projectRoot: options.projectRoot,
        instruction: input.instruction,
        sessionId: context.sessionId,
        turnId: context.turnId,
        files: context.files,
        modelAdapter: options.modelAdapter,
        parentSignal: context.signal,
        budget: options.budget,
        limits: options.limits,
        toolExecutor: options.toolExecutor,
      });
    },
  });
}
