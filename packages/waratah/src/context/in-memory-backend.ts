import { WaratahError } from '../shared/errors.js';
import type { SessionEntry } from '../shared/contracts.js';
import type { SessionPath } from '../shared/ids.js';
import type { SessionFilesystemBackend } from './session-filesystem.js';
import { MAX_SESSION_FILE_BYTES } from './session-filesystem.js';

/** Maximum number of files retained by one in-memory session backend. */
export const MAX_SESSION_ENTRIES = 256;

export class InMemorySessionBackend implements SessionFilesystemBackend {
  private readonly files = new Map<SessionPath, string>();

  constructor(private readonly maxEntries = MAX_SESSION_ENTRIES) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > MAX_SESSION_ENTRIES) {
      throw new WaratahError(
        'PAYLOAD_LIMIT_EXCEEDED',
        'The payload exceeds the allowed size. Reduce the payload and try again.',
      );
    }
  }

  async read(path: SessionPath): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new WaratahError(
        'TOOL_EXECUTION_FAILED',
        'The tool could not complete. Check the tool configuration and retry only when the operation is safe.',
      );
    }
    return content;
  }

  async write(path: SessionPath, content: string): Promise<void> {
    if (Buffer.byteLength(content, 'utf8') > MAX_SESSION_FILE_BYTES) {
      throw new WaratahError(
        'PAYLOAD_LIMIT_EXCEEDED',
        'The payload exceeds the allowed size. Reduce the payload and try again.',
      );
    }
    if (!this.files.has(path) && this.files.size >= this.maxEntries) {
      throw new WaratahError(
        'PAYLOAD_LIMIT_EXCEEDED',
        'The payload exceeds the allowed size. Reduce the payload and try again.',
      );
    }
    this.files.set(path, content);
  }

  async list(path: SessionPath): Promise<readonly SessionEntry[]> {
    const prefix = `${path}/`;
    const entries = new Map<SessionPath, SessionEntry>();

    for (const filePath of this.files.keys()) {
      if (!filePath.startsWith(prefix)) {
        continue;
      }

      const remainder = filePath.slice(prefix.length);
      const separator = remainder.indexOf('/');
      if (separator === -1) {
        entries.set(filePath, {
          path: filePath,
          kind: 'file',
        });
        continue;
      }

      const directoryPath = `${path}/${remainder.slice(0, separator)}` as SessionPath;
      entries.set(directoryPath, {
        path: directoryPath,
        kind: 'directory',
      });
    }

    return [...entries.values()].sort((left, right) => left.path.localeCompare(right.path));
  }
}
