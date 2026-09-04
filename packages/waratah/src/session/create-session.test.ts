import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { compileAcceptGraph } from '../harness/compile-graph.js';
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
    [
      'path-unsafe delivery ID',
      {
        deliveryId: '../escape',
        triggeredAt: validTimestamp,
        message: 'Run.',
        trigger: 'http',
      },
    ],
    [
      'delivery ID with a slash',
      {
        deliveryId: 'has/slash',
        triggeredAt: validTimestamp,
        message: 'Run.',
        trigger: 'http',
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
      deliveryId: 'schedule-2026-09-04',
      triggeredAt: validTimestamp,
      message: 'Run.',
      trigger: 'schedule',
    });

    expect(result).toEqual({
      sessionId: 'schedule-2026-09-04',
      accepted: true,
    });
    expect(threadIdFor('schedule-2026-09-04')).toBe(result.sessionId);
  });

  it('returns duplicate when the thread already exists', async () => {
    const checkpointer = createMemoryCheckpointer();
    const graph = compileAcceptGraph(checkpointer);
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

  it('scaffolds an inspectable session directory for a unique delivery', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'waratah-session-store-'));
    temporaryDirectories.push(projectRoot);
    const service = new CreateSessionService(createMemoryCheckpointer(), { projectRoot });

    const result = await service.create({
      deliveryId: 'delivery-one',
      triggeredAt: validTimestamp,
      message: 'Run the digest.',
      trigger: 'http',
    });

    expect(result).toEqual({ sessionId: 'delivery-one', accepted: true });
    const sessionRoot = join(projectRoot, '.waratah', 'session', 'delivery-one');
    const meta = JSON.parse(await readFile(join(sessionRoot, 'meta.json'), 'utf8')) as {
      readonly sessionId: string;
      readonly status: string;
      readonly deliveryId: string;
    };
    expect(meta).toMatchObject({
      sessionId: 'delivery-one',
      deliveryId: 'delivery-one',
      status: 'pending',
    });
    const transcript = parseJsonl(await readFile(join(sessionRoot, 'transcript.jsonl'), 'utf8'));
    expect(transcript).toEqual([
      expect.objectContaining({ type: 'system', event: 'accepted' }),
      expect.objectContaining({ type: 'user', content: 'Run the digest.' }),
    ]);
    await expect(stat(join(sessionRoot, 'files'))).resolves.toMatchObject({ isDirectory: expect.any(Function) });
    expect((await stat(join(sessionRoot, 'files'))).isDirectory()).toBe(true);
  });

  it('percent-encodes timestamp delivery IDs as session directory names', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'waratah-session-encoded-'));
    temporaryDirectories.push(projectRoot);
    const service = new CreateSessionService(createMemoryCheckpointer(), { projectRoot });
    const deliveryId = 'daily-changes:2026-03-29T14:00:00+11:00';

    const result = await service.create({
      deliveryId,
      triggeredAt: validTimestamp,
      message: 'Run.',
      trigger: 'schedule',
    });

    expect(result).toEqual({ sessionId: deliveryId, accepted: true });
    await expect(
      stat(join(projectRoot, '.waratah', 'session', encodeURIComponent(deliveryId), 'meta.json')),
    ).resolves.toMatchObject({ isFile: expect.any(Function) });
  });

  it('returns duplicate when the session directory already exists', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'waratah-session-dup-'));
    temporaryDirectories.push(projectRoot);
    const service = new CreateSessionService(createMemoryCheckpointer(), { projectRoot });
    const command = {
      deliveryId: 'delivery-one',
      triggeredAt: validTimestamp,
      message: 'Run.',
      trigger: 'http' as const,
    };

    await expect(service.create(command)).resolves.toMatchObject({ accepted: true });
    await expect(service.create(command)).resolves.toEqual({
      sessionId: 'delivery-one',
      accepted: false,
      duplicateOf: 'delivery-one',
    });
  });
});

describe('sqlite checkpointer', () => {
  it('persists a thread to .waratah/sessions.db', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'waratah-checkpointer-'));
    temporaryDirectories.push(projectRoot);
    const checkpointer = createSqliteCheckpointer(projectRoot);
    const graph = compileAcceptGraph(checkpointer);
    await graph.invoke({}, { configurable: { thread_id: 'local-delivery' } });

    expect(await getThread(checkpointer, 'local-delivery')).toBeDefined();
  });
});

function parseJsonl(raw: string): unknown[] {
  return raw
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
}
