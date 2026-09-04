import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { MAX_SESSION_FILE_BYTES } from '../context/session-filesystem.js';
import { DiskSessionBackend } from '../context/disk-backend.js';
import { asSessionId, asSessionPath } from '../shared/ids.js';
import { createMemoryCheckpointer } from './checkpointer.js';
import { CreateSessionService } from './create-session.js';
import {
  createFilesystemSessionStore,
  openSessionFilesystem,
} from './filesystem-store.js';
import { sessionDirectory } from './layout.js';

const validTimestamp = '2026-09-04T00:00:00.000Z';
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('FilesystemSessionStore', () => {
  it('materializes findings under the session files directory', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'waratah-session-files-'));
    temporaryDirectories.push(projectRoot);
    const store = createFilesystemSessionStore(projectRoot);
    const service = new CreateSessionService(createMemoryCheckpointer(), { sessionStore: store });
    await service.create({
      deliveryId: 'session-one',
      triggeredAt: validTimestamp,
      message: 'Run.',
      trigger: 'http',
    });

    const sessionId = asSessionId('session-one');
    const files = openSessionFilesystem(store, sessionId);
    const finding = asSessionPath('/session/session-one/findings/example.md');

    await files.write(finding, 'systems analysis');

    await expect(files.read(finding)).resolves.toBe('systems analysis');
    await expect(files.list(asSessionPath('/session/session-one/findings'))).resolves.toEqual([
      { path: finding, kind: 'file' },
    ]);
    await expect(files.list(asSessionPath('/session/session-one'))).resolves.toEqual([
      { path: '/session/session-one/findings', kind: 'directory' },
    ]);
    await expect(
      readFile(
        join(sessionDirectory(projectRoot, 'session-one'), 'files', 'findings', 'example.md'),
        'utf8',
      ),
    ).resolves.toBe('systems analysis');
  });

  it('rejects traversal before writing outside the session files root', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'waratah-session-escape-'));
    temporaryDirectories.push(projectRoot);
    const store = createFilesystemSessionStore(projectRoot);
    const sessionId = asSessionId('session-one');
    await store.create(sessionId, {
      deliveryId: 'session-one',
      triggeredAt: validTimestamp,
      message: 'Run.',
      trigger: 'http',
    });
    const files = openSessionFilesystem(store, sessionId);

    await expect(
      files.write(asSessionPath('/session/session-one/../secret.md'), 'nope'),
    ).rejects.toMatchObject({ code: 'INVALID_SESSION_PATH' });
  });

  it('defends the file-size cap', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'waratah-session-cap-'));
    temporaryDirectories.push(projectRoot);
    const store = createFilesystemSessionStore(projectRoot);
    const sessionId = asSessionId('session-one');
    await store.create(sessionId, {
      deliveryId: 'session-one',
      triggeredAt: validTimestamp,
      message: 'Run.',
      trigger: 'http',
    });
    const files = openSessionFilesystem(store, sessionId);

    await expect(
      files.write(
        asSessionPath('/session/session-one/findings/large.md'),
        'a'.repeat(MAX_SESSION_FILE_BYTES + 1),
      ),
    ).rejects.toMatchObject({ code: 'PAYLOAD_LIMIT_EXCEEDED' });
  });

  it('caps the number of retained disk files and blocks path escape', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'waratah-session-backend-'));
    temporaryDirectories.push(projectRoot);
    const store = createFilesystemSessionStore(projectRoot);
    const sessionId = asSessionId('session-one');
    await store.create(sessionId, {
      deliveryId: 'session-one',
      triggeredAt: validTimestamp,
      message: 'Run.',
      trigger: 'http',
    });
    const backend = new DiskSessionBackend(store.filesDirectory(sessionId), sessionId, 1);
    const first = asSessionPath('/session/session-one/first.md');

    await backend.write(first, 'first');
    await backend.write(first, 'updated');
    await expect(backend.read(first)).resolves.toBe('updated');
    await expect(backend.write(asSessionPath('/session/session-one/second.md'), 'second')).rejects.toMatchObject({
      code: 'PAYLOAD_LIMIT_EXCEEDED',
    });
    await expect(
      backend.write(asSessionPath('/session/session-one/../../secret.md'), 'nope'),
    ).rejects.toMatchObject({ code: 'INVALID_SESSION_PATH' });
  });
});
