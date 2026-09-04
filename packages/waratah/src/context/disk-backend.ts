import { mkdir, open, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';

import type { SessionEntry } from '../shared/contracts.js';
import { WaratahError } from '../shared/errors.js';
import type { SessionId, SessionPath } from '../shared/ids.js';
import { asSessionPath } from '../shared/ids.js';
import { MAX_SESSION_ENTRIES } from './in-memory-backend.js';
import { MAX_SESSION_FILE_BYTES, type SessionFilesystemBackend } from './session-filesystem.js';

/**
 * Persists the virtual `/session/<id>/…` tree under
 * `.waratah/session/<id>/files/`.
 */
export class DiskSessionBackend implements SessionFilesystemBackend {
  constructor(
    private readonly filesRoot: string,
    private readonly sessionId: SessionId,
    private readonly maxEntries = MAX_SESSION_ENTRIES,
  ) {}

  async read(path: SessionPath): Promise<string> {
    const diskPath = this.toDiskPath(path);
    try {
      return await readFile(diskPath, 'utf8');
    } catch (error) {
      if (isMissing(error)) {
        throw new WaratahError(
          'TOOL_EXECUTION_FAILED',
          'The tool could not complete. Check the tool configuration and retry only when the operation is safe.',
        );
      }
      throw error;
    }
  }

  async write(path: SessionPath, content: string): Promise<void> {
    if (Buffer.byteLength(content, 'utf8') > MAX_SESSION_FILE_BYTES) {
      throw new WaratahError(
        'PAYLOAD_LIMIT_EXCEEDED',
        'The payload exceeds the allowed size. Reduce the payload and try again.',
      );
    }
    const diskPath = this.toDiskPath(path);
    if (!(await this.hasFile(diskPath)) && (await this.fileCount()) >= this.maxEntries) {
      throw new WaratahError(
        'PAYLOAD_LIMIT_EXCEEDED',
        'The payload exceeds the allowed size. Reduce the payload and try again.',
      );
    }
    await mkdir(dirname(diskPath), { recursive: true });
    await writeAtomicFile(diskPath, content);
  }

  async list(path: SessionPath): Promise<readonly SessionEntry[]> {
    const diskPath = this.toDiskPath(path);
    let names: string[];
    try {
      names = await readdir(diskPath);
    } catch (error) {
      if (isMissing(error)) {
        return [];
      }
      throw error;
    }

    const entries: SessionEntry[] = [];
    for (const name of names.sort((left, right) => left.localeCompare(right))) {
      if (name.startsWith('.')) {
        continue;
      }
      const childDisk = join(diskPath, name);
      const info = await stat(childDisk);
      const childVirtual = `${path}/${name}`;
      entries.push({
        path: asSessionPath(childVirtual),
        kind: info.isDirectory() ? 'directory' : 'file',
      });
    }
    return entries;
  }

  private sessionRoot(): string {
    return `/session/${this.sessionId}`;
  }

  private toDiskPath(path: SessionPath): string {
    const root = this.sessionRoot();
    let relativePath = '';
    if (path === root) {
      relativePath = '';
    } else if (path.startsWith(`${root}/`)) {
      relativePath = path.slice(root.length + 1);
    } else {
      throw new WaratahError(
        'INVALID_SESSION_PATH',
        'The session path is invalid. Use a path within the active session root.',
      );
    }
    const target = relativePath === '' ? resolve(this.filesRoot) : resolve(this.filesRoot, relativePath);
    const escaped = relative(this.filesRoot, target);
    if (escaped.startsWith(`..${sep}`) || escaped === '..') {
      throw new WaratahError(
        'INVALID_SESSION_PATH',
        'The session path is invalid. Use a path within the active session root.',
      );
    }
    return target;
  }

  private async hasFile(diskPath: string): Promise<boolean> {
    try {
      const info = await stat(diskPath);
      return info.isFile();
    } catch {
      return false;
    }
  }

  private async fileCount(): Promise<number> {
    return countFiles(this.filesRoot);
  }
}

async function countFiles(directory: string): Promise<number> {
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if (isMissing(error)) {
      return 0;
    }
    throw error;
  }
  let count = 0;
  for (const name of names) {
    const child = join(directory, name);
    const info = await stat(child);
    if (info.isDirectory()) {
      count += await countFiles(child);
    } else {
      count += 1;
    }
  }
  return count;
}

async function writeAtomicFile(destination: string, content: string): Promise<void> {
  const temporaryPath = join(dirname(destination), `.file-${process.pid}-${randomUUID()}.tmp`);
  try {
    const handle = await open(temporaryPath, 'wx', 0o600);
    try {
      await handle.writeFile(content, 'utf8');
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

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    ((error as NodeJS.ErrnoException).code === 'ENOENT' ||
      (error as NodeJS.ErrnoException).code === 'ENOTDIR')
  );
}
