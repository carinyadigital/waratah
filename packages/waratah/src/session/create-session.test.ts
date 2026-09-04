import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createAgent } from '../agent/create-agent.js';
import { compileGraph } from '../harness/compile-graph.js';
import {
  createMemoryCheckpointer,
  createSqliteCheckpointer,
  getThread,
} from './checkpointer.js';
import { CreateSessionService } from './create-session.js';
import { threadIdFor } from './thread-id.js';

const validTimestamp = '2026-09-04T00:00:00.000Z';
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const definition = () =>
  createAgent({
    name: 'lead',
    model: 'test-model',
    instructions: ['./instructions.md'],
    skills: [],
    memory: [],
    tools: [],
    subagents: [],
    channels: [],
  });

describe('CreateSessionService', () => {
  it.each([
    ['missing delivery ID', { triggeredAt: validTimestamp, message: 'Run.', trigger: 'http' }],
    ['missing trigger time', { deliveryId: 'delivery-one', message: 'Run.', trigger: 'http' }],
    [
      'malformed trigger time',
      {
        deliveryId: 'delivery-one',
        triggeredAt: 'yesterday',
        message: 'Run.',
        trigger: 'http',
      },
    ],
    [
      'unknown metadata field',
      {
        deliveryId: 'delivery-one',
        triggeredAt: validTimestamp,
        message: 'Run.',
        trigger: 'http',
        metadata: { unexpected: 'value' },
      },
    ],
  ])('rejects %s before consulting the checkpointer', async (_label, command) => {
    const service = new CreateSessionService(createMemoryCheckpointer());

    await expect(service.create(command)).rejects.toMatchObject({
      name: 'InvalidSessionRequest',
    });
  });

  it('accepts a unique delivery and maps it to a stable thread id', async () => {
    const service = new CreateSessionService(createMemoryCheckpointer());

    const result = await service.create({
      deliveryId: 'cron-2026-09-04',
      triggeredAt: validTimestamp,
      message: 'Run.',
      trigger: 'cron',
    });

    expect(result).toEqual({
      sessionId: 'cron-2026-09-04',
      accepted: true,
    });
    expect(threadIdFor('cron-2026-09-04')).toBe(result.sessionId);
  });

  it('returns duplicate when the thread already exists', async () => {
    const checkpointer = createMemoryCheckpointer();
    const graph = compileGraph(definition(), { checkpointer });
    await graph.invoke({}, { configurable: { thread_id: 'delivery-one' } });
    const service = new CreateSessionService(checkpointer);

    const result = await service.create({
      deliveryId: 'delivery-one',
      triggeredAt: validTimestamp,
      message: 'Run.',
      trigger: 'http',
    });

    expect(result).toEqual({
      sessionId: 'delivery-one',
      accepted: false,
      duplicateOf: 'delivery-one',
    });
    expect(await getThread(checkpointer, 'delivery-one')).toBeDefined();
  });

  it('rejects an oversized message before writing a thread', async () => {
    const checkpointer = createMemoryCheckpointer();
    const service = new CreateSessionService(checkpointer, {
      limits: { maxSessionMessageBytes: 4 },
    });

    await expect(
      service.create({
        deliveryId: 'delivery-one',
        triggeredAt: validTimestamp,
        message: 'three',
        trigger: 'http',
      }),
    ).rejects.toMatchObject({ code: 'PAYLOAD_LIMIT_EXCEEDED' });
    expect(await getThread(checkpointer, 'delivery-one')).toBeUndefined();
  });
});

describe('sqlite checkpointer', () => {
  it('persists a thread to .waratah/sessions.db', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'waratah-checkpointer-'));
    temporaryDirectories.push(projectRoot);
    const checkpointer = createSqliteCheckpointer(projectRoot);
    const graph = compileGraph(definition(), { checkpointer });
    await graph.invoke({}, { configurable: { thread_id: 'local-delivery' } });

    expect(await getThread(checkpointer, 'local-delivery')).toBeDefined();
  });
});
