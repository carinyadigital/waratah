import { lstat, opendir, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import type { AgentDefinition } from '../shared/contracts.js';
import {
  MAX_DISCOVERED_FILES,
  MAX_DISCOVERED_FILE_BYTES,
  MAX_DISCOVERED_TOTAL_BYTES,
  MAX_DISCOVERY_DEPTH,
} from '../shared/discovery-limits.js';
import { WaratahError } from '../shared/errors.js';
import { resolveDefaultMemoryPath } from './resolve-path.js';

export const MAX_MEMORY_LINES = 200;
export const MAX_MEMORY_BYTES = 25_000;

export const MAX_DIRECTORY_ENTRIES = 10_000;
const DEFAULT_MEMORY_PATH = '.waratah/memory/';
const DEFAULT_SKILLS_PATH = './skills/';
const TRUNCATION_MARKER = '[waratah: MEMORY.md truncated to 200 lines / 25 KB]';
const IGNORED_PROJECT_DIRECTORIES = new Set(['.waratah', '.git', 'node_modules']);

export interface LoadSessionStartOptions {
  readonly definition: Pick<AgentDefinition, 'memory' | 'skills'>;
  readonly agentFile: string;
  readonly projectRoot: string;
}

export interface LoadedContentFile {
  readonly path: string;
  readonly content: string;
  readonly truncated?: true;
}

export interface SessionStartContent {
  readonly agents: readonly LoadedContentFile[];
  readonly memory: readonly LoadedContentFile[];
  readonly skills: readonly LoadedContentFile[];
}

interface LoadState {
  readonly projectRoot: string;
  files: number;
  entries: number;
  bytes: number;
}

interface WalkOptions {
  readonly optional: boolean;
  readonly match: (path: string) => boolean;
  readonly followSymlinks: boolean;
  readonly pruneIgnoredDirectories: boolean;
}

/**
 * Loads the filesystem-authored content needed when an agent session starts.
 *
 * Omitted-source defaults are already normalized by `createAgent`; explicit
 * empty arrays therefore remain empty and disable that source.
 */
export async function loadSessionStartContent(
  options: LoadSessionStartOptions,
): Promise<SessionStartContent> {
  const requestedProjectRoot = resolve(options.projectRoot);
  const projectRoot = await realpath(requestedProjectRoot).catch(() => invalidContentPath());
  const requestedAgentFile = resolve(options.agentFile);
  const agentFile = await realpath(requestedAgentFile).catch(() => invalidContentPath());
  if (!isWithin(projectRoot, agentFile)) {
    invalidContentPath();
  }

  const state: LoadState = { projectRoot, files: 0, entries: 0, bytes: 0 };
  const agents = await discoverProjectAgents(projectRoot, state);
  const skills = await loadDeclaredSources(
    options.definition.skills,
    dirname(agentFile),
    projectRoot,
    state,
    DEFAULT_SKILLS_PATH,
    () => true,
  );
  const memory = await loadMemorySources(options, agentFile, projectRoot, state);

  return {
    agents: sortFiles(agents),
    memory: sortFiles(memory),
    skills: sortFiles(skills),
  };
}

/** Loads declared instruction files through the same confined discovery rules as session content. */
export async function loadSessionInstructions(options: {
  readonly definition: Pick<AgentDefinition, 'instructions'>;
  readonly agentFile: string;
  readonly projectRoot: string;
}): Promise<readonly LoadedContentFile[]> {
  const projectRoot = await realpath(resolve(options.projectRoot)).catch(() => invalidContentPath());
  const agentFile = await realpath(resolve(options.agentFile)).catch(() => invalidContentPath());
  if (!isWithin(projectRoot, agentFile)) {
    invalidContentPath();
  }

  const state: LoadState = { projectRoot, files: 0, entries: 0, bytes: 0 };
  return sortFiles(
    await loadDeclaredSources(
      options.definition.instructions,
      dirname(agentFile),
      projectRoot,
      state,
      '',
      () => true,
    ),
  );
}

/**
 * Applies both memory limits while preserving valid UTF-8 and making every
 * truncation visible in the resulting model context.
 */
export function applyMemoryBudget(content: string): {
  readonly content: string;
  readonly truncated: boolean;
} {
  if (
    countLines(content) <= MAX_MEMORY_LINES &&
    Buffer.byteLength(content, 'utf8') <= MAX_MEMORY_BYTES
  ) {
    return { content, truncated: false };
  }

  const logicalLines = splitLines(content).slice(0, MAX_MEMORY_LINES - 1);
  const linePrefix = logicalLines.join('\n');
  const separator = linePrefix === '' ? '' : '\n';
  const availableBytes =
    MAX_MEMORY_BYTES -
    Buffer.byteLength(separator, 'utf8') -
    Buffer.byteLength(TRUNCATION_MARKER, 'utf8');
  const prefix = truncateUtf8(linePrefix, availableBytes);

  return {
    content: `${prefix}${prefix === '' ? '' : '\n'}${TRUNCATION_MARKER}`,
    truncated: true,
  };
}

async function loadMemorySources(
  options: LoadSessionStartOptions,
  agentFile: string,
  projectRoot: string,
  state: LoadState,
): Promise<readonly LoadedContentFile[]> {
  const files: LoadedContentFile[] = [];

  for (const authoredPath of options.definition.memory) {
    if (isAbsolute(authoredPath)) {
      invalidContentPath();
    }
    const isDefault = authoredPath === DEFAULT_MEMORY_PATH;
    const candidate = isDefault
      ? await resolveDefaultMemoryPath(projectRoot)
      : resolve(dirname(agentFile), authoredPath);
    const confinementRoot = isDefault ? dirname(dirname(dirname(candidate))) : projectRoot;
    const loaded = await walkContent(candidate, confinementRoot, state, 0, new Set(), {
      optional: isDefault,
      match: (path) => !isDefault || path === candidate,
      followSymlinks: true,
      pruneIgnoredDirectories: false,
    });

    for (const file of loaded) {
      const budgeted = applyMemoryBudget(file.content);
      files.push({
        path: isDefault ? '.waratah/memory/MEMORY.md' : file.path,
        content: budgeted.content,
        ...(budgeted.truncated ? { truncated: true as const } : {}),
      });
    }
  }

  return files;
}

async function loadDeclaredSources(
  authoredPaths: readonly string[],
  baseDirectory: string,
  projectRoot: string,
  state: LoadState,
  optionalDefault: string,
  match: (path: string) => boolean,
): Promise<readonly LoadedContentFile[]> {
  const files: LoadedContentFile[] = [];
  for (const authoredPath of authoredPaths) {
    if (isAbsolute(authoredPath)) {
      invalidContentPath();
    }
    files.push(
      ...(await walkContent(
        resolve(baseDirectory, authoredPath),
        projectRoot,
        state,
        0,
        new Set(),
        {
          optional: authoredPath === optionalDefault,
          match,
          followSymlinks: true,
          pruneIgnoredDirectories: false,
        },
      )),
    );
  }
  return files;
}

async function discoverProjectAgents(
  projectRoot: string,
  state: LoadState,
): Promise<readonly LoadedContentFile[]> {
  return walkContent(projectRoot, projectRoot, state, 0, new Set(), {
    optional: true,
    match: (path) => path.endsWith(`${sep}AGENTS.md`) || path === resolve(projectRoot, 'AGENTS.md'),
    followSymlinks: false,
    pruneIgnoredDirectories: true,
  });
}

async function walkContent(
  candidate: string,
  confinementRoot: string,
  state: LoadState,
  depth: number,
  visitedDirectories: Set<string>,
  options: WalkOptions,
): Promise<readonly LoadedContentFile[]> {
  if (depth > MAX_DISCOVERY_DEPTH) {
    invalidContentPath();
  }

  let metadata;
  try {
    metadata = await lstat(candidate);
  } catch (error) {
    if (options.optional && isMissing(error)) {
      return [];
    }
    invalidContentPath();
  }

  if (metadata.isSymbolicLink() && !options.followSymlinks) {
    return [];
  }

  const resolvedCandidate = await realpath(candidate).catch(() => invalidContentPath());
  const resolvedRoot = await realpath(confinementRoot).catch(() => invalidContentPath());
  if (!isWithin(resolvedRoot, resolvedCandidate)) {
    invalidContentPath();
  }

  const resolvedMetadata = metadata.isSymbolicLink()
    ? await lstat(resolvedCandidate).catch(() => invalidContentPath())
    : metadata;
  if (resolvedMetadata.isDirectory()) {
    if (visitedDirectories.has(resolvedCandidate)) {
      return [];
    }
    visitedDirectories.add(resolvedCandidate);

    const entries = await readDirectoryEntries(
      resolvedCandidate,
      MAX_DIRECTORY_ENTRIES - state.entries,
    );
    state.entries += entries.length;
    const files: LoadedContentFile[] = [];
    for (const entry of entries.sort(compareText)) {
      if (options.pruneIgnoredDirectories && IGNORED_PROJECT_DIRECTORIES.has(entry)) {
        continue;
      }
      files.push(
        ...(await walkContent(
          resolve(resolvedCandidate, entry),
          resolvedRoot,
          state,
          depth + 1,
          visitedDirectories,
          options,
        )),
      );
    }
    return files;
  }

  if (!resolvedMetadata.isFile() || !options.match(resolvedCandidate)) {
    return [];
  }
  if (resolvedMetadata.size > MAX_DISCOVERED_FILE_BYTES || state.files >= MAX_DISCOVERED_FILES) {
    invalidContentPath();
  }
  if (state.bytes + resolvedMetadata.size > MAX_DISCOVERED_TOTAL_BYTES) {
    invalidContentPath();
  }

  const content = await readFile(resolvedCandidate, 'utf8').catch(() => invalidContentPath());
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > MAX_DISCOVERED_FILE_BYTES || state.bytes + bytes > MAX_DISCOVERED_TOTAL_BYTES) {
    invalidContentPath();
  }

  state.files += 1;
  state.bytes += bytes;
  return [{ path: displayPath(state.projectRoot, resolvedCandidate), content }];
}

export async function collectBoundedEntries(
  entries: AsyncIterable<{ readonly name: string }>,
  remaining: number,
): Promise<string[]> {
  const names: string[] = [];
  for await (const entry of entries) {
    if (names.length >= remaining) {
      invalidContentPath();
    }
    names.push(entry.name);
  }
  return names;
}

async function readDirectoryEntries(path: string, remaining: number): Promise<string[]> {
  const directory = await opendir(path).catch(() => invalidContentPath());
  try {
    return await collectBoundedEntries(directory, remaining);
  } finally {
    await directory.close().catch(() => undefined);
  }
}

function countLines(content: string): number {
  if (content === '') {
    return 0;
  }
  const separators = content.match(/\r\n|\n|\r/gu)?.length ?? 0;
  return separators + (/(?:\r\n|\n|\r)$/u.test(content) ? 0 : 1);
}

function splitLines(content: string): string[] {
  const lines = content.split(/\r\n|\n|\r/u);
  if (lines.at(-1) === '') {
    lines.pop();
  }
  return lines;
}

function truncateUtf8(content: string, maxBytes: number): string {
  let bytes = 0;
  let result = '';
  for (const character of content) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (bytes + characterBytes > maxBytes) {
      break;
    }
    result += character;
    bytes += characterBytes;
  }
  return result;
}

function sortFiles(files: readonly LoadedContentFile[]): readonly LoadedContentFile[] {
  return [...files].sort((left, right) => compareText(left.path, right.path));
}

function displayPath(projectRoot: string, path: string): string {
  const projectRelative = relative(projectRoot, path);
  return sep === '/' ? projectRelative : projectRelative.split(sep).join('/');
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isWithin(root: string, candidate: string): boolean {
  const rootRelative = relative(resolve(root), resolve(candidate));
  return (
    rootRelative === '' ||
    (!rootRelative.startsWith(`..${sep}`) && rootRelative !== '..' && !isAbsolute(rootRelative))
  );
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'ENOENT'
  );
}

function invalidContentPath(): never {
  throw new WaratahError(
    'INVALID_AGENT',
    'The agent definition is invalid. Correct the reported definition fields and try again.',
  );
}
