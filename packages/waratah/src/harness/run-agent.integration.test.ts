import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAgent, defineTool } from '../agent/create-agent.js';
import { ConfinedSessionFilesystem } from '../context/session-filesystem.js';
import { InMemorySessionBackend } from '../context/in-memory-backend.js';
import { createMemoryCheckpointer } from '../session/checkpointer.js';
import { CreateSessionService } from '../session/create-session.js';
import {
  createFilesystemSessionStore,
  openSessionFilesystem,
} from '../session/filesystem-store.js';
import type { AgentDefinition, ModelAdapter, ModelMessage, Schema } from '../shared/contracts.js';
import { asSessionId, createTurnId } from '../shared/ids.js';
import { runAgent } from './run-agent.js';

const valueSchema: Schema<string> = {
  parse(input) {
    if (typeof input !== 'object' || input === null) {
      throw new TypeError('Expected an object');
    }
    const value = (input as { readonly value?: unknown }).value;
    if (typeof value !== 'string') {
      throw new TypeError('Expected a string value');
    }
    return value;
  },
};

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('runAgent', () => {
  it('completes a model and tool round trip inside the compiled graph', async () => {
    const execute = vi.fn(async (input: string) => ({ echoed: input }));
    const model: ModelAdapter = {
      complete: vi.fn(async ({ messages }) => {
        const toolResult = messages.findLast((message: ModelMessage) => message.role === 'tool');
        if (toolResult === undefined) {
          return {
            type: 'tool_calls' as const,
            toolCalls: [{ id: 'call-1', name: 'echo', arguments: { value: 'hello' } }],
          };
        }
        return { type: 'message' as const, content: 'complete' };
      }),
    };
    const harness = await createHarness(
      [
        defineTool({
          name: 'echo',
          description: 'Echo a string.',
          inputSchema: valueSchema,
          execute,
        }),
      ],
      model,
    );

    await expect(runAgent(harness.options)).resolves.toEqual({ content: 'complete', steps: 3 });
    expect(execute).toHaveBeenCalledOnce();
    expect(model.complete).toHaveBeenCalledTimes(2);
  });

  it('fails at the step limit without another model call', async () => {
    const execute = vi.fn(async () => 'done');
    const model: ModelAdapter = {
      complete: vi.fn(async () => ({
        type: 'tool_calls' as const,
        toolCalls: [{ id: 'call-1', name: 'echo', arguments: { value: 'hello' } }],
      })),
    };
    const harness = await createHarness(
      [
        defineTool({
          name: 'echo',
          description: 'Echo a string.',
          inputSchema: valueSchema,
          execute,
        }),
      ],
      model,
    );

    await expect(
      runAgent({
        ...harness.options,
        limits: {
          maxSteps: 2,
          maxToolCallsPerStep: 4,
          maxToolResultBytes: 256_000,
          maxFindingBytes: 32_000,
        },
      }),
    ).rejects.toMatchObject({ code: 'STEP_LIMIT_EXCEEDED' });
    expect(model.complete).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledOnce();
  });

  it('appends a Cursor-style transcript without tool payloads', async () => {
    const execute = vi.fn(async (input: string) => ({ echoed: input }));
    const model: ModelAdapter = {
      complete: vi.fn(async ({ messages }) => {
        const toolResult = messages.findLast((message: ModelMessage) => message.role === 'tool');
        if (toolResult === undefined) {
          return {
            type: 'tool_calls' as const,
            toolCalls: [{ id: 'call-1', name: 'echo', arguments: { value: 'secret-payload' } }],
          };
        }
        return { type: 'message' as const, content: 'complete' };
      }),
    };
    const harness = await createHarness(
      [
        defineTool({
          name: 'echo',
          description: 'Echo a string.',
          inputSchema: valueSchema,
          execute,
        }),
      ],
      model,
    );
    const store = createFilesystemSessionStore(harness.options.projectRoot);
    const sessions = new CreateSessionService(createMemoryCheckpointer(), { sessionStore: store });
    await sessions.create({
      deliveryId: 'session-one',
      triggeredAt: '2026-09-04T00:00:00.000Z',
      message: harness.options.input,
      trigger: 'http',
    });
    const files = openSessionFilesystem(store, harness.options.sessionId);

    await expect(
      runAgent({ ...harness.options, files, sessionStore: store }),
    ).resolves.toEqual({ content: 'complete', steps: 3 });

    const transcript = parseJsonl(
      await readFile(
        join(harness.options.projectRoot, '.waratah', 'session', 'session-one', 'transcript.jsonl'),
        'utf8',
      ),
    );
    expect(transcript).toEqual([
      expect.objectContaining({ type: 'system', event: 'accepted' }),
      expect.objectContaining({ type: 'user', content: 'Run the fixture.' }),
      expect.objectContaining({ type: 'system', event: 'started' }),
      expect.objectContaining({ type: 'tool', name: 'echo', status: 'started' }),
      expect.objectContaining({ type: 'tool', name: 'echo', status: 'succeeded' }),
      expect.objectContaining({ type: 'assistant', content: 'complete' }),
      expect.objectContaining({ type: 'system', event: 'succeeded' }),
    ]);
    expect(JSON.stringify(transcript)).not.toContain('secret-payload');
    const meta = JSON.parse(
      await readFile(
        join(harness.options.projectRoot, '.waratah', 'session', 'session-one', 'meta.json'),
        'utf8',
      ),
    ) as { readonly status: string };
    expect(meta.status).toBe('succeeded');
  });
});

async function createHarness(
  tools: AgentDefinition['tools'],
  modelAdapter: ModelAdapter,
) {
  const projectRoot = await mkdtemp(join(tmpdir(), 'waratah-harness-'));
  temporaryDirectories.push(projectRoot);
  await mkdir(join(projectRoot, 'agent'), { recursive: true });
  await writeFile(join(projectRoot, 'agent', 'agent.ts'), 'export {};\n');
  await writeFile(join(projectRoot, 'agent', 'instructions.md'), 'Follow the fixture instructions.\n');
  await writeFile(join(projectRoot, 'AGENTS.md'), 'Keep fixture data local.\n');

  const agent = createAgent({
    name: 'lead',
    model: 'fixture-model',
    instructions: ['./instructions.md'],
    skills: [],
    memory: [],
    tools,
    subagents: [],
    channels: [],
  });
  const sessionId = asSessionId('session-one');

  return {
    options: {
      agent,
      agentFile: join(projectRoot, 'agent', 'agent.ts'),
      projectRoot,
      sessionId,
      turnId: createTurnId(),
      files: new ConfinedSessionFilesystem(sessionId, new InMemorySessionBackend()),
      modelAdapter,
      input: 'Run the fixture.',
    },
  };
}

function parseJsonl(raw: string): unknown[] {
  return raw
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
}
