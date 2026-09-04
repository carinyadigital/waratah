import { describe, expect, it, vi } from 'vitest';

import { ConfinedSessionFilesystem } from '../context/session-filesystem.js';
import type { SessionFilesystemBackend } from '../context/session-filesystem.js';
import { InMemorySessionBackend } from '../context/in-memory-backend.js';
import type { SessionId, StepId, TurnId } from '../shared/ids.js';
import { ToolExecutor, type ToolExecutionResources } from './executor.js';
import { filesystemTools } from './filesystem.js';

const sessionId = 'S' as SessionId;

const resources = (backend: SessionFilesystemBackend): ToolExecutionResources => ({
  sessionId,
  turnId: 'turn' as TurnId,
  stepId: 'step' as StepId,
  files: new ConfinedSessionFilesystem(sessionId, backend),
  signal: new AbortController().signal,
});

describe('filesystem tools', () => {
  it('writes, reads, and lists through the confined session filesystem', async () => {
    const executor = new ToolExecutor({ name: 'lead', tools: [...filesystemTools] });
    const context = resources(new InMemorySessionBackend());

    await expect(
      executor.execute(
        {
          id: 'write-call',
          name: 'write',
          arguments: { path: 'findings/report.md', content: 'ready' },
        },
        context,
      ),
    ).resolves.toBeUndefined();
    await expect(
      executor.execute(
        { id: 'read-call', name: 'read', arguments: { path: 'findings/report.md' } },
        context,
      ),
    ).resolves.toBe('ready');
    await expect(
      executor.execute({ id: 'list-call', name: 'list', arguments: { path: 'findings' } }, context),
    ).resolves.toEqual([
      {
        path: '/session/S/findings/report.md',
        kind: 'file',
      },
    ]);
  });

  it('rejects escape attempts before a filesystem backend is called', async () => {
    const backend: SessionFilesystemBackend = {
      read: vi.fn(),
      write: vi.fn(),
      list: vi.fn(),
    };
    const executor = new ToolExecutor({ name: 'lead', tools: [...filesystemTools] });

    await expect(
      executor.execute(
        {
          id: 'write-call',
          name: 'write',
          arguments: { path: '/session/other/secret.md', content: 'changed' },
        },
        resources(backend),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_SESSION_PATH' });
    expect(backend.write).not.toHaveBeenCalled();
  });
});
