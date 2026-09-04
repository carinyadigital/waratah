import { describe, expect, it, vi } from 'vitest';

import type { SessionId, SessionPath } from '../shared/ids.js';
import { InMemorySessionBackend, MAX_SESSION_ENTRIES } from './in-memory-backend.js';
import {
  ConfinedSessionFilesystem,
  MAX_SESSION_FILE_BYTES,
  type SessionFilesystemBackend,
} from './session-filesystem.js';

const sessionId = 'S' as SessionId;
const asSessionPath = (path: string): SessionPath => path as SessionPath;

describe('ConfinedSessionFilesystem', () => {
  it('writes, reads, and lists a finding in one session', async () => {
    const files = new ConfinedSessionFilesystem(sessionId, new InMemorySessionBackend());
    const finding = asSessionPath('/session/S/findings/example.md');
    const findings = asSessionPath('/session/S/findings');

    await files.write(finding, 'hello');

    await expect(files.read(finding)).resolves.toBe('hello');
    await expect(files.list(findings)).resolves.toEqual([
      {
        path: finding,
        kind: 'file',
      },
    ]);
  });

  it('rejects traversal before the backend receives a read', async () => {
    const backend: SessionFilesystemBackend = {
      read: vi.fn(),
      write: vi.fn(),
      list: vi.fn(),
    };
    const files = new ConfinedSessionFilesystem(sessionId, backend);

    await expect(files.read(asSessionPath('/session/S/../other/secret.md'))).rejects.toMatchObject({
      code: 'INVALID_SESSION_PATH',
    });
    expect(backend.read).not.toHaveBeenCalled();
  });

  it('rejects an oversized write before the backend receives it', async () => {
    const backend: SessionFilesystemBackend = {
      read: vi.fn(),
      write: vi.fn(),
      list: vi.fn(),
    };
    const files = new ConfinedSessionFilesystem(sessionId, backend);

    await expect(
      files.write(
        asSessionPath('/session/S/findings/example.md'),
        'a'.repeat(MAX_SESSION_FILE_BYTES + 1),
      ),
    ).rejects.toMatchObject({
      code: 'PAYLOAD_LIMIT_EXCEEDED',
    });
    expect(backend.write).not.toHaveBeenCalled();
  });

  it('lists immediate directories without exposing nested files', async () => {
    const files = new ConfinedSessionFilesystem(sessionId, new InMemorySessionBackend());

    await files.write(asSessionPath('findings/nested/example.md'), 'hello');

    await expect(files.list(asSessionPath('/session/S/findings'))).resolves.toEqual([
      {
        path: '/session/S/findings/nested',
        kind: 'directory',
      },
    ]);
  });
});

describe('InMemorySessionBackend', () => {
  it('caps the number of retained entries while allowing overwrites', async () => {
    const backend = new InMemorySessionBackend(1);
    const first = asSessionPath('/session/S/first.md');
    const second = asSessionPath('/session/S/second.md');

    await backend.write(first, 'first');
    await backend.write(first, 'updated');
    await expect(backend.read(first)).resolves.toBe('updated');
    await expect(backend.write(second, 'second')).rejects.toMatchObject({
      code: 'PAYLOAD_LIMIT_EXCEEDED',
    });
  });

  it('defends the file-size cap when used directly', async () => {
    const backend = new InMemorySessionBackend();

    await expect(
      backend.write(asSessionPath('/session/S/large.md'), 'a'.repeat(MAX_SESSION_FILE_BYTES + 1)),
    ).rejects.toMatchObject({
      code: 'PAYLOAD_LIMIT_EXCEEDED',
    });
  });

  it('uses explicit bounded defaults', () => {
    expect(MAX_SESSION_FILE_BYTES).toBe(256_000);
    expect(MAX_SESSION_ENTRIES).toBe(256);
  });
});
