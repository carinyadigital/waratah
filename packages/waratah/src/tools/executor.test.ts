import { describe, expect, it, vi } from 'vitest';

import type { ApprovalPolicy } from '../approval/policy.js';
import { defineTool } from '../agent/create-agent.js';
import type { AgentDefinition, Schema, SessionFilesystem } from '../shared/contracts.js';
import type { SessionId, StepId, TurnId } from '../shared/ids.js';
import { ToolExecutor, type ToolExecutionResources } from './executor.js';

const valueSchema: Schema<string> = {
  parse(input) {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw new TypeError('Expected an object');
    }
    const value = (input as { readonly value?: unknown }).value;
    if (typeof value !== 'string') {
      throw new TypeError('Expected a string value');
    }
    return value;
  },
};

const files: SessionFilesystem = {
  read: vi.fn(),
  write: vi.fn(),
  list: vi.fn(),
};

const resources: ToolExecutionResources = {
  sessionId: 'session' as SessionId,
  turnId: 'turn' as TurnId,
  stepId: 'step' as StepId,
  files,
  signal: new AbortController().signal,
};

const agent = (
  name: string,
  tools: AgentDefinition['tools'],
): Pick<AgentDefinition, 'name' | 'tools'> => ({ name, tools });

describe('ToolExecutor', () => {
  it('returns a typed error for an unknown tool', async () => {
    const executor = new ToolExecutor(agent('lead', []));

    await expect(
      executor.execute({ id: 'call-1', name: 'missing', arguments: {} }, resources),
    ).rejects.toMatchObject({ code: 'UNKNOWN_TOOL' });
  });

  it('returns a typed error for invalid input without executing', async () => {
    const execute = vi.fn(async () => 'done');
    const tool = defineTool({
      name: 'echo',
      description: 'Echo a string.',
      inputSchema: valueSchema,
      execute,
    });
    const executor = new ToolExecutor(agent('lead', [tool]));

    await expect(
      executor.execute({ id: 'call-1', name: 'echo', arguments: 42 as never }, resources),
    ).rejects.toMatchObject({ code: 'TOOL_INPUT_INVALID' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('fails an already-aborted call without executing and emits one failed terminal event', async () => {
    const controller = new AbortController();
    controller.abort();
    const execute = vi.fn(async () => 'done');
    const finished = vi.fn();
    const tool = defineTool({
      name: 'echo',
      description: 'Echo a string.',
      inputSchema: valueSchema,
      execute,
    });
    const executor = new ToolExecutor(agent('lead', [tool]), {
      trace: { started: vi.fn(), finished },
    });

    await expect(
      executor.execute(
        { id: 'call-1', name: 'echo', arguments: { value: 'value' } },
        { ...resources, signal: controller.signal },
      ),
    ).rejects.toMatchObject({ code: 'TOOL_EXECUTION_FAILED' });
    expect(execute).not.toHaveBeenCalled();
    expect(finished).toHaveBeenCalledOnce();
    expect(finished).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorCode: 'TOOL_EXECUTION_FAILED',
      }),
    );
  });

  it('does not execute a defined tool that is undeclared by the agent', async () => {
    const execute = vi.fn(async () => 'changed');
    defineTool({
      name: 'write-external',
      description: 'Perform an external write.',
      inputSchema: valueSchema,
      execute,
    });
    const executor = new ToolExecutor(agent('lead', []));

    await expect(
      executor.execute(
        { id: 'call-1', name: 'write-external', arguments: { value: 'payload' } },
        resources,
      ),
    ).rejects.toMatchObject({ code: 'UNKNOWN_TOOL' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('keeps a tool bound to one agent inaccessible to another', async () => {
    const execute = vi.fn(async () => 'private');
    const workerTool = defineTool({
      name: 'worker-read',
      description: 'Read worker-owned data.',
      inputSchema: valueSchema,
      execute,
    });
    const workerExecutor = new ToolExecutor(agent('analyst', [workerTool]));
    const leadExecutor = new ToolExecutor(agent('lead', []));

    await expect(
      leadExecutor.execute(
        { id: 'call-1', name: 'worker-read', arguments: { value: 'data' } },
        resources,
      ),
    ).rejects.toMatchObject({ code: 'UNKNOWN_TOOL' });
    expect(execute).not.toHaveBeenCalled();

    await expect(
      workerExecutor.execute(
        { id: 'call-2', name: 'worker-read', arguments: { value: 'data' } },
        resources,
      ),
    ).resolves.toBe('private');
    expect(execute).toHaveBeenCalledOnce();
  });

  it('consults approval for a read-only tool and prevents denied execution', async () => {
    const execute = vi.fn(async () => 'content');
    const read = defineTool({
      name: 'read-only',
      description: 'Read data without changing it.',
      inputSchema: valueSchema,
      execute,
    });
    const evaluate = vi.fn<ApprovalPolicy['evaluate']>(() => ({ allowed: false }));
    const executor = new ToolExecutor(agent('lead', [read]), {
      approvalPolicy: { evaluate },
    });

    await expect(
      executor.execute({ id: 'call-1', name: 'read-only', arguments: { value: 'path' } }, resources),
    ).rejects.toMatchObject({ code: 'TOOL_EXECUTION_FAILED' });
    expect(evaluate).toHaveBeenCalledOnce();
    expect(execute).not.toHaveBeenCalled();
  });

  it('calls the side-effect budget hook before every valid execution', async () => {
    const order: string[] = [];
    const tool = defineTool({
      name: 'post',
      description: 'Post a value.',
      inputSchema: valueSchema,
      execute: async () => {
        order.push('execute');
      },
    });
    const beforeToolExecution = vi.fn(async () => {
      order.push('budget');
    });
    const executor = new ToolExecutor(agent('lead', [tool]), {
      approvalPolicy: {
        evaluate: () => {
          order.push('approval');
          return { allowed: true };
        },
      },
      sideEffectBudget: { beforeToolExecution },
    });

    await executor.execute({ id: 'call-1', name: 'post', arguments: { value: 'value' } }, resources);

    expect(order).toEqual(['budget', 'approval', 'execute']);
  });

  it('prevents execution when the side-effect budget hook throws', async () => {
    const execute = vi.fn(async () => 'posted');
    const tool = defineTool({
      name: 'post',
      description: 'Post a value.',
      inputSchema: valueSchema,
      execute,
    });
    const executor = new ToolExecutor(agent('lead', [tool]), {
      sideEffectBudget: {
        beforeToolExecution: () => {
          throw new Error('budget unavailable');
        },
      },
    });

    await expect(
      executor.execute({ id: 'call-1', name: 'post', arguments: { value: 'value' } }, resources),
    ).rejects.toMatchObject({ code: 'TOOL_EXECUTION_FAILED' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('emits secret-safe start and terminal trace metadata', async () => {
    const tool = defineTool({
      name: 'echo',
      description: 'Echo a string.',
      inputSchema: valueSchema,
      execute: async (input) => input,
    });
    const started = vi.fn();
    const finished = vi.fn();
    const executor = new ToolExecutor(agent('lead', [tool]), {
      trace: { started, finished },
    });

    await executor.execute({ id: 'call-1', name: 'echo', arguments: { value: 'secret' } }, resources);

    expect(started).toHaveBeenCalledWith(
      expect.objectContaining({ callId: 'call-1', agentName: 'lead', toolName: 'echo' }),
    );
    expect(JSON.stringify([started.mock.calls, finished.mock.calls])).not.toContain('secret');
  });
});
