import { WaratahError } from '../shared/errors.js';
import type { SessionEntry, SessionFilesystem } from '../shared/contracts.js';
import type { SessionId, SessionPath } from '../shared/ids.js';
import { normalizeSessionPath } from './paths.js';

/** Maximum number of UTF-8 bytes stored in one session file. */
export const MAX_SESSION_FILE_BYTES = 256_000;

export interface SessionFilesystemBackend {
  read(path: SessionPath): Promise<string>;
  write(path: SessionPath, content: string): Promise<void>;
  list(path: SessionPath): Promise<readonly SessionEntry[]>;
}

/**
 * Keeps every backend operation behind session-path validation. No backend
 * method is selected or invoked until the requested path is canonical and
 * proven to belong to the active session.
 */
export class ConfinedSessionFilesystem implements SessionFilesystem {
  constructor(
    private readonly sessionId: SessionId,
    private readonly backend: SessionFilesystemBackend,
  ) {}

  async read(path: SessionPath): Promise<string> {
    const confinedPath = normalizeSessionPath(this.sessionId, path);
    return this.backend.read(confinedPath);
  }

  async write(path: SessionPath, content: string): Promise<void> {
    const confinedPath = normalizeSessionPath(this.sessionId, path);
    if (Buffer.byteLength(content, 'utf8') > MAX_SESSION_FILE_BYTES) {
      throw new WaratahError(
        'PAYLOAD_LIMIT_EXCEEDED',
        'The payload exceeds the allowed size. Reduce the payload and try again.',
      );
    }
    await this.backend.write(confinedPath, content);
  }

  async list(path: SessionPath): Promise<readonly SessionEntry[]> {
    const confinedPath = normalizeSessionPath(this.sessionId, path);
    return this.backend.list(confinedPath);
  }
}
