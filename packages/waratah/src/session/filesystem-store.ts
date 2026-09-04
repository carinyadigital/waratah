import { mkdir, readFile, writeFile, appendFile, open, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { ConfinedSessionFilesystem } from '../context/session-filesystem.js';
import { DiskSessionBackend } from '../context/disk-backend.js';
import type { CreateSessionCommand, SessionStatus } from '../shared/contracts.js';
import { WaratahError, type WaratahErrorCode } from '../shared/errors.js';
import type { SessionId } from '../shared/ids.js';
import {
  sessionDirectory,
  sessionFilesDirectory,
  sessionMetaPath,
  sessionTranscriptPath,
} from './layout.js';

export interface SessionMeta {
  readonly sessionId: SessionId;
  readonly deliveryId: string;
  readonly trigger: CreateSessionCommand['trigger'];
  readonly triggeredAt: string;
  readonly status: SessionStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly errorCode?: WaratahErrorCode;
}

export type SessionTranscriptLine =
  | {
      readonly timestamp: string;
      readonly type: 'system';
      readonly event: 'accepted' | 'started' | 'succeeded' | 'failed';
      readonly errorCode?: WaratahErrorCode;
    }
  | { readonly timestamp: string; readonly type: 'user'; readonly content: string }
  | { readonly timestamp: string; readonly type: 'assistant'; readonly content: string }
  | {
      readonly timestamp: string;
      readonly type: 'tool';
      readonly name: string;
      readonly status: 'started' | 'succeeded' | 'failed';
      readonly errorCode?: WaratahErrorCode;
    };

export type CreateFilesystemSessionResult = 'created' | 'duplicate';

/** Cursor/Claude-style inspectable session directory under `.waratah/session/<id>/`. */
export class FilesystemSessionStore {
  constructor(readonly projectRoot: string) {}

  async readMeta(sessionId: string): Promise<SessionMeta | undefined> {
    try {
      const raw = await readFile(sessionMetaPath(this.projectRoot, sessionId), 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (!isSessionMeta(parsed)) {
        return undefined;
      }
      return parsed;
    } catch (error) {
      if (isMissing(error)) {
        return undefined;
      }
      throw new WaratahError(
        'SESSION_STORE_ERROR',
        'The session store is unavailable. Restore the store before accepting or resuming work.',
      );
    }
  }

  async create(
    sessionId: SessionId,
    command: CreateSessionCommand,
  ): Promise<CreateFilesystemSessionResult> {
    const directory = sessionDirectory(this.projectRoot, sessionId);
    try {
      await mkdir(dirname(directory), { recursive: true });
      await mkdir(directory);
    } catch (error) {
      if (isAlreadyExists(error)) {
        return 'duplicate';
      }
      throw storeUnavailable();
    }

    const now = new Date().toISOString();
    const meta: SessionMeta = {
      sessionId,
      deliveryId: command.deliveryId,
      trigger: command.trigger,
      triggeredAt: command.triggeredAt,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    try {
      await mkdir(sessionFilesDirectory(this.projectRoot, sessionId), { recursive: true });
      await writeAtomicJson(sessionMetaPath(this.projectRoot, sessionId), meta);
      await writeFile(sessionTranscriptPath(this.projectRoot, sessionId), '', { flag: 'wx' });
      await this.appendTranscript(sessionId, {
        timestamp: now,
        type: 'system',
        event: 'accepted',
      });
      await this.appendTranscript(sessionId, {
        timestamp: now,
        type: 'user',
        content: command.message,
      });
    } catch {
      throw storeUnavailable();
    }

    return 'created';
  }

  async updateStatus(
    sessionId: SessionId,
    status: SessionStatus,
    errorCode?: WaratahErrorCode,
  ): Promise<void> {
    const current = await this.readMeta(sessionId);
    if (current === undefined) {
      throw storeUnavailable();
    }
    const next: SessionMeta = {
      ...current,
      status,
      updatedAt: new Date().toISOString(),
      ...(errorCode === undefined ? {} : { errorCode }),
    };
    await writeAtomicJson(sessionMetaPath(this.projectRoot, sessionId), next);
  }

  async appendTranscript(sessionId: SessionId, line: SessionTranscriptLine): Promise<void> {
    await appendFile(
      sessionTranscriptPath(this.projectRoot, sessionId),
      `${JSON.stringify(line)}\n`,
      'utf8',
    );
  }

  filesDirectory(sessionId: SessionId): string {
    return sessionFilesDirectory(this.projectRoot, sessionId);
  }
}

export function createFilesystemSessionStore(projectRoot: string): FilesystemSessionStore {
  return new FilesystemSessionStore(projectRoot);
}

export function openSessionFilesystem(
  store: FilesystemSessionStore,
  sessionId: SessionId,
): ConfinedSessionFilesystem {
  return new ConfinedSessionFilesystem(
    sessionId,
    new DiskSessionBackend(store.filesDirectory(sessionId), sessionId),
  );
}

function isSessionMeta(value: unknown): value is SessionMeta {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.sessionId === 'string' &&
    typeof record.deliveryId === 'string' &&
    (record.trigger === 'manual' ||
      record.trigger === 'schedule' ||
      record.trigger === 'http') &&
    typeof record.triggeredAt === 'string' &&
    typeof record.status === 'string' &&
    typeof record.createdAt === 'string' &&
    typeof record.updatedAt === 'string'
  );
}

async function writeAtomicJson(destination: string, value: unknown): Promise<void> {
  const temporaryPath = join(dirname(destination), `.meta-${process.pid}-${randomUUID()}.tmp`);
  try {
    const handle = await open(temporaryPath, 'wx', 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(value, undefined, 2)}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, destination);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function storeUnavailable(): WaratahError {
  return new WaratahError(
    'SESSION_STORE_ERROR',
    'The session store is unavailable. Restore the store before accepting or resuming work.',
  );
}

function isMissing(error: unknown): boolean {
  return isErrno(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}

function isAlreadyExists(error: unknown): boolean {
  return isErrno(error) && error.code === 'EEXIST';
}

function isErrno(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}
