import { lstat, readFile, realpath, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

const MAX_GIT_POINTER_BYTES = 4_096;

/**
 * Resolves the default memory file for a project without invoking git, so that
 * every linked worktree of one repository shares a single memory file.
 *
 * The `.git` pointer file is project-writable, untrusted input, so its target
 * is honoured only when the target independently corroborates the link.
 * Missing, malformed, or hostile metadata falls back to the project-local file.
 */
export async function resolveDefaultMemoryPath(projectRoot: string): Promise<string> {
  const root = await realpath(resolve(projectRoot)).catch(() => resolve(projectRoot));
  const sharedRoot = await resolveWorktreeSharedRoot(root);

  return defaultMemoryPath(sharedRoot ?? root);
}

async function resolveWorktreeSharedRoot(root: string): Promise<string | undefined> {
  const gitEntry = join(root, '.git');
  const pointer = await readGitdirPointer(gitEntry);
  if (pointer === undefined) {
    return undefined;
  }

  const gitDirectory = await canonicalDirectory(resolve(root, pointer));
  if (gitDirectory === undefined) {
    return undefined;
  }

  const commonPointer = await readPointerPath(join(gitDirectory, 'commondir'));
  if (commonPointer === undefined) {
    return undefined;
  }
  const commonDirectory = await canonicalDirectory(resolve(gitDirectory, commonPointer));
  if (commonDirectory === undefined || !(await isGitCommonDirectory(commonDirectory))) {
    return undefined;
  }

  const worktreesDirectory = await canonicalDirectory(join(commonDirectory, 'worktrees'));
  if (worktreesDirectory === undefined || dirname(gitDirectory) !== worktreesDirectory) {
    return undefined;
  }

  if (!(await pointsBackTo(gitDirectory, gitEntry))) {
    return undefined;
  }

  return dirname(commonDirectory);
}

async function pointsBackTo(gitDirectory: string, gitEntry: string): Promise<boolean> {
  const recorded = await readPointerPath(join(gitDirectory, 'gitdir'));
  if (recorded === undefined) {
    return false;
  }

  const [claimed, actual] = await Promise.all([
    realpath(resolve(gitDirectory, recorded)).catch(() => undefined),
    realpath(gitEntry).catch(() => undefined),
  ]);

  return claimed !== undefined && claimed === actual;
}

async function isGitCommonDirectory(commonDirectory: string): Promise<boolean> {
  if (basename(commonDirectory) !== '.git') {
    return false;
  }

  const [head, objects] = await Promise.all([
    stat(join(commonDirectory, 'HEAD')).catch(() => undefined),
    stat(join(commonDirectory, 'objects')).catch(() => undefined),
  ]);

  return head?.isFile() === true && objects?.isDirectory() === true;
}

async function canonicalDirectory(path: string): Promise<string | undefined> {
  const canonical = await realpath(path).catch(() => undefined);
  if (canonical === undefined) {
    return undefined;
  }
  const metadata = await stat(canonical).catch(() => undefined);

  return metadata?.isDirectory() === true ? canonical : undefined;
}

async function readGitdirPointer(gitEntry: string): Promise<string | undefined> {
  const content = await readBoundedText(gitEntry);
  const match = content === undefined ? undefined : /^gitdir:\s*(.+)$/u.exec(content);

  return match?.[1];
}

async function readPointerPath(path: string): Promise<string | undefined> {
  const content = await readBoundedText(path);

  return content === undefined || content === '' ? undefined : content;
}

async function readBoundedText(path: string): Promise<string | undefined> {
  const metadata = await lstat(path).catch(() => undefined);
  if (metadata === undefined || !metadata.isFile() || metadata.size > MAX_GIT_POINTER_BYTES) {
    return undefined;
  }
  const content = await readFile(path, 'utf8').catch(() => undefined);

  return content?.trim();
}

function defaultMemoryPath(root: string): string {
  return join(root, '.waratah', 'memory', 'MEMORY.md');
}
