import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import type { AgentDefinition } from '../shared/contracts.js';
import {
  MAX_DISCOVERED_FILES,
  MAX_DISCOVERED_FILE_BYTES,
  MAX_DISCOVERED_TOTAL_BYTES,
  MAX_DISCOVERY_DEPTH,
} from '../shared/discovery-limits.js';
import { isBuiltinToolName } from '../tools/builtin-names.js';
import type { CompilerDiagnostic } from './diagnostics.js';

const DEFAULT_SKILLS_PATH = './skills/';
const DEFAULT_MEMORY_PATH = '.waratah/memory/';

export interface DiscoverAgentOptions {
  readonly definition: AgentDefinition;
  readonly agentFile: string;
  readonly projectRoot: string;
}

export interface DiscoveredFile {
  readonly path: string;
  readonly content: Uint8Array;
}

export interface DiscoveredAgent {
  readonly definition: AgentDefinition;
  readonly sourceFile: string;
  readonly instructions: readonly DiscoveredFile[];
  readonly skills: readonly DiscoveredFile[];
  readonly memory: readonly DiscoveredFile[];
  readonly subagents: readonly DiscoveredAgent[];
}

export interface DiscoveryResult {
  readonly rootAgent?: DiscoveredAgent;
  readonly diagnostics: readonly CompilerDiagnostic[];
}

interface DiscoveryState {
  readonly projectRoot: string;
  readonly authoredRoot: string;
  readonly memoryRoot: string;
  readonly diagnostics: CompilerDiagnostic[];
  readonly activeDefinitions: Set<AgentDefinition>;
  fileCount: number;
  totalBytes: number;
  boundsExhausted: boolean;
}

interface SourceRequest {
  readonly authoredPath: string;
  readonly baseDirectory: string;
  readonly confinementRoot: string;
  readonly optionalWhenMissing: boolean;
}

export async function discoverAgent(options: DiscoverAgentOptions): Promise<DiscoveryResult> {
  const requestedProjectRoot = resolve(options.projectRoot);
  const projectRoot = await realpath(requestedProjectRoot).catch(() => requestedProjectRoot);
  const requestedSourceFile = resolve(options.agentFile);
  const sourceFile = await realpath(requestedSourceFile).catch(() => requestedSourceFile);
  const authoredRoot = dirname(sourceFile);
  const state: DiscoveryState = {
    projectRoot,
    authoredRoot,
    memoryRoot: join(projectRoot, '.waratah', 'memory'),
    diagnostics: [],
    activeDefinitions: new Set(),
    fileCount: 0,
    totalBytes: 0,
    boundsExhausted: false,
  };

  if (!isWithin(projectRoot, sourceFile)) {
    addDiagnostic(
      state,
      options.definition.name,
      sourceFile,
      sourceFile,
      'The root agent file must be inside the project root.',
    );
    return { diagnostics: state.diagnostics };
  }

  const rootAgent = await discoverDefinition(options.definition, sourceFile, state, 0);
  return { rootAgent, diagnostics: state.diagnostics };
}

async function discoverDefinition(
  definition: AgentDefinition,
  sourceFile: string,
  state: DiscoveryState,
  depth: number,
): Promise<DiscoveredAgent | undefined> {
  const agent = safeAgentName(definition.name);
  const sourceLocation = displayPath(state.projectRoot, sourceFile);

  if (depth > MAX_DISCOVERY_DEPTH) {
    addDiagnostic(
      state,
      agent,
      sourceFile,
      sourceFile,
      `Agent nesting exceeds the maximum depth of ${MAX_DISCOVERY_DEPTH}.`,
    );
    return undefined;
  }

  if (state.activeDefinitions.has(definition)) {
    addDiagnostic(
      state,
      agent,
      sourceFile,
      sourceFile,
      'The agent graph contains a recursive definition reference.',
    );
    return undefined;
  }

  state.activeDefinitions.add(definition);
  await validateSourceFile(definition.name, sourceFile, state);
  validateDefinition(definition, sourceFile, state);

  const agentDirectory = dirname(sourceFile);
  const instructions = await discoverSources(
    definition.instructions.map((authoredPath) => ({
      authoredPath,
      baseDirectory: agentDirectory,
      confinementRoot: state.authoredRoot,
      optionalWhenMissing: false,
    })),
    definition.name,
    sourceFile,
    state,
  );
  const skills = await discoverSources(
    definition.skills.map((authoredPath) => ({
      authoredPath,
      baseDirectory: agentDirectory,
      confinementRoot: state.authoredRoot,
      optionalWhenMissing: authoredPath === DEFAULT_SKILLS_PATH,
    })),
    definition.name,
    sourceFile,
    state,
  );
  const memory = await discoverSources(
    definition.memory.map((authoredPath) => {
      const isDefault = authoredPath === DEFAULT_MEMORY_PATH;
      return {
        authoredPath,
        baseDirectory: isDefault ? state.projectRoot : agentDirectory,
        confinementRoot: isDefault ? state.memoryRoot : state.authoredRoot,
        optionalWhenMissing: isDefault,
      };
    }),
    definition.name,
    sourceFile,
    state,
  );

  const subagents: DiscoveredAgent[] = [];
  const sortedDefinitions = [...definition.subagents].sort((left, right) =>
    compareText(left.name, right.name),
  );

  for (const subagent of sortedDefinitions) {
    const expectedChildFile = resolve(agentDirectory, 'subagents', subagent.name, 'agent.ts');
    const childFile = await realpath(expectedChildFile).catch(() => expectedChildFile);
    const discovered = await discoverDefinition(subagent, childFile, state, depth + 1);
    if (discovered !== undefined) {
      subagents.push(discovered);
    }
  }

  state.activeDefinitions.delete(definition);

  return {
    definition,
    sourceFile: sourceLocation,
    instructions,
    skills,
    memory,
    subagents,
  };
}

async function validateSourceFile(
  agent: string,
  sourceFile: string,
  state: DiscoveryState,
): Promise<void> {
  if (!isWithin(state.authoredRoot, sourceFile)) {
    addDiagnostic(
      state,
      agent,
      sourceFile,
      sourceFile,
      'The agent definition file escapes the authored agent root.',
    );
    return;
  }

  try {
    const metadata = await lstat(sourceFile);
    if (!metadata.isFile()) {
      addDiagnostic(
        state,
        agent,
        sourceFile,
        sourceFile,
        'The agent definition location is not a regular file.',
      );
    }
  } catch (error) {
    addDiagnostic(
      state,
      agent,
      sourceFile,
      sourceFile,
      isMissing(error)
        ? 'The agent definition file does not exist at the expected authored location.'
        : 'The agent definition file could not be inspected.',
    );
  }
}

function validateDefinition(
  definition: AgentDefinition,
  sourceFile: string,
  state: DiscoveryState,
): void {
  const agent = safeAgentName(definition.name);

  if (!isSafePathSegment(definition.name)) {
    addDiagnostic(
      state,
      agent,
      sourceFile,
      definition.name,
      'Agent names must be a single path-safe segment containing only letters, numbers, underscores, and hyphens.',
    );
  }

  if (definition.kind === 'subagent' && definition.channels.length > 0) {
    state.diagnostics.push({
      code: 'INVALID_CHANNEL_SCOPE',
      message: `Subagent ${JSON.stringify(agent)} declares channels ${formatNames(definition.channels)}. Remove all channels because only lead agents can receive triggers.`,
      agent,
      file: displayPath(state.projectRoot, sourceFile),
      path: 'channels',
    });
  }

  validateUniqueNames(definition.tools, 'tool', agent, sourceFile, state);
  validateReservedToolNames(definition, agent, sourceFile, state);
  validateUniqueNames(definition.channels, 'channel', agent, sourceFile, state);
  validateUniqueNames(definition.subagents, 'subagent', agent, sourceFile, state);

  for (const subagent of definition.subagents) {
    if (subagent.kind !== 'subagent') {
      addDiagnostic(
        state,
        agent,
        sourceFile,
        `subagents.${safeAgentName(subagent.name)}.kind`,
        `Declared child ${JSON.stringify(safeAgentName(subagent.name))} must have kind "subagent".`,
      );
    }
  }
}

function validateReservedToolNames(
  definition: AgentDefinition,
  agent: string,
  sourceFile: string,
  state: DiscoveryState,
): void {
  for (const tool of definition.tools) {
    if (isBuiltinToolName(tool.name)) {
      addDiagnostic(
        state,
        agent,
        sourceFile,
        `tools.${tool.name}`,
        `The authored tool name ${JSON.stringify(tool.name)} is reserved for waratah's built-in ${JSON.stringify(tool.name)} tool. Rename the authored tool.`,
      );
    }
  }
}

function validateUniqueNames(
  definitions: readonly { readonly name: string }[],
  kind: string,
  agent: string,
  sourceFile: string,
  state: DiscoveryState,
): void {
  const counts = new Map<string, number>();
  for (const definition of definitions) {
    counts.set(definition.name, (counts.get(definition.name) ?? 0) + 1);
  }

  for (const [name, count] of [...counts].sort(([left], [right]) => compareText(left, right))) {
    if (count > 1) {
      addDiagnostic(
        state,
        agent,
        sourceFile,
        `${kind}s.${name}`,
        `The ${kind} name ${JSON.stringify(name)} is declared ${count} times. Give every ${kind} a unique name within this agent.`,
      );
    }
  }
}

async function discoverSources(
  requests: readonly SourceRequest[],
  agent: string,
  sourceFile: string,
  state: DiscoveryState,
): Promise<readonly DiscoveredFile[]> {
  const files = new Map<string, DiscoveredFile>();

  for (const request of requests) {
    if (state.boundsExhausted) {
      break;
    }

    if (isAbsolute(request.authoredPath)) {
      addDiagnostic(
        state,
        agent,
        sourceFile,
        request.authoredPath,
        'Content paths must be relative so manifests remain portable between machines.',
      );
      continue;
    }

    const candidate = resolve(request.baseDirectory, request.authoredPath);
    if (!isWithin(request.confinementRoot, candidate)) {
      addDiagnostic(
        state,
        agent,
        sourceFile,
        request.authoredPath,
        'The content path escapes its permitted authored area.',
      );
      continue;
    }

    const discovered = await walkSource(candidate, request, agent, sourceFile, state, 0, new Set());
    for (const file of discovered) {
      files.set(file.path, file);
    }
  }

  return [...files.values()].sort((left, right) => compareText(left.path, right.path));
}

async function walkSource(
  candidate: string,
  request: SourceRequest,
  agent: string,
  sourceFile: string,
  state: DiscoveryState,
  depth: number,
  visitedDirectories: Set<string>,
): Promise<readonly DiscoveredFile[]> {
  if (depth > MAX_DISCOVERY_DEPTH) {
    addDiagnostic(
      state,
      agent,
      sourceFile,
      request.authoredPath,
      `Content traversal exceeds the maximum depth of ${MAX_DISCOVERY_DEPTH}.`,
    );
    return [];
  }

  let metadata;
  try {
    metadata = await lstat(candidate);
  } catch (error) {
    if (isMissing(error) && request.optionalWhenMissing) {
      return [];
    }
    addDiagnostic(
      state,
      agent,
      sourceFile,
      request.authoredPath,
      isMissing(error)
        ? 'The declared content path does not exist.'
        : 'The declared content path could not be inspected.',
    );
    return [];
  }

  let resolvedCandidate: string;
  try {
    resolvedCandidate = await realpath(candidate);
  } catch {
    addDiagnostic(
      state,
      agent,
      sourceFile,
      request.authoredPath,
      'The declared content path could not be resolved.',
    );
    return [];
  }

  if (!isWithin(request.confinementRoot, resolvedCandidate)) {
    addDiagnostic(
      state,
      agent,
      sourceFile,
      request.authoredPath,
      'The declared content path resolves through a symlink outside its permitted authored area.',
    );
    return [];
  }

  let resolvedMetadata = metadata;
  if (metadata.isSymbolicLink()) {
    try {
      resolvedMetadata = await lstat(resolvedCandidate);
    } catch {
      addDiagnostic(
        state,
        agent,
        sourceFile,
        request.authoredPath,
        'The declared symlink target could not be inspected.',
      );
      return [];
    }
  }

  if (resolvedMetadata.isDirectory()) {
    if (visitedDirectories.has(resolvedCandidate)) {
      return [];
    }
    visitedDirectories.add(resolvedCandidate);

    let entries;
    try {
      entries = await readdir(resolvedCandidate);
    } catch {
      addDiagnostic(
        state,
        agent,
        sourceFile,
        request.authoredPath,
        'The declared content directory could not be read.',
      );
      return [];
    }

    const files: DiscoveredFile[] = [];
    for (const entry of entries.sort(compareText)) {
      files.push(
        ...(await walkSource(
          join(resolvedCandidate, entry),
          request,
          agent,
          sourceFile,
          state,
          depth + 1,
          visitedDirectories,
        )),
      );
      if (state.boundsExhausted) {
        break;
      }
    }
    return files;
  }

  if (!resolvedMetadata.isFile()) {
    addDiagnostic(
      state,
      agent,
      sourceFile,
      request.authoredPath,
      'The declared content path is neither a regular file nor a directory.',
    );
    return [];
  }

  if (resolvedMetadata.size > MAX_DISCOVERED_FILE_BYTES) {
    addDiagnostic(
      state,
      agent,
      sourceFile,
      request.authoredPath,
      `The discovered file exceeds the ${MAX_DISCOVERED_FILE_BYTES}-byte per-file limit.`,
    );
    return [];
  }

  if (state.fileCount >= MAX_DISCOVERED_FILES) {
    exhaustBounds(
      state,
      agent,
      sourceFile,
      request.authoredPath,
      `Discovery exceeds the ${MAX_DISCOVERED_FILES}-file limit.`,
    );
    return [];
  }

  if (state.totalBytes + resolvedMetadata.size > MAX_DISCOVERED_TOTAL_BYTES) {
    exhaustBounds(
      state,
      agent,
      sourceFile,
      request.authoredPath,
      `Discovery exceeds the ${MAX_DISCOVERED_TOTAL_BYTES}-byte total content limit.`,
    );
    return [];
  }

  try {
    const content = await readFile(resolvedCandidate);
    if (content.byteLength > MAX_DISCOVERED_FILE_BYTES) {
      addDiagnostic(
        state,
        agent,
        sourceFile,
        request.authoredPath,
        `The discovered file exceeds the ${MAX_DISCOVERED_FILE_BYTES}-byte per-file limit.`,
      );
      return [];
    }
    if (state.totalBytes + content.byteLength > MAX_DISCOVERED_TOTAL_BYTES) {
      exhaustBounds(
        state,
        agent,
        sourceFile,
        request.authoredPath,
        `Discovery exceeds the ${MAX_DISCOVERED_TOTAL_BYTES}-byte total content limit.`,
      );
      return [];
    }
    state.fileCount += 1;
    state.totalBytes += content.byteLength;
    return [{ path: displayPath(state.projectRoot, candidate), content }];
  } catch {
    addDiagnostic(
      state,
      agent,
      sourceFile,
      request.authoredPath,
      'The discovered file could not be read.',
    );
    return [];
  }
}

function exhaustBounds(
  state: DiscoveryState,
  agent: string,
  sourceFile: string,
  path: string,
  message: string,
): void {
  if (!state.boundsExhausted) {
    addDiagnostic(state, agent, sourceFile, path, message);
    state.boundsExhausted = true;
  }
}

function addDiagnostic(
  state: DiscoveryState,
  agent: string,
  sourceFile: string,
  path: string,
  message: string,
): void {
  state.diagnostics.push({
    code: 'INVALID_AGENT',
    message,
    agent: safeAgentName(agent),
    file: displayPath(state.projectRoot, sourceFile),
    path: displayAuthoredPath(state.projectRoot, path),
  });
}

function displayAuthoredPath(projectRoot: string, path: string): string {
  return isAbsolute(path) ? displayPath(projectRoot, path) : normalizeSeparators(path);
}

function displayPath(projectRoot: string, path: string): string {
  const projectRelative = relative(projectRoot, path);
  return normalizeSeparators(projectRelative === '' ? '.' : projectRelative);
}

function normalizeSeparators(path: string): string {
  return sep === '/' ? path : path.split(sep).join('/');
}

function isWithin(root: string, candidate: string): boolean {
  const rootRelative = relative(resolve(root), resolve(candidate));
  return (
    rootRelative === '' ||
    (!rootRelative.startsWith(`..${sep}`) && rootRelative !== '..' && !isAbsolute(rootRelative))
  );
}

function isSafePathSegment(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value);
}

function safeAgentName(value: unknown): string {
  return typeof value === 'string' && value !== '' ? value : '<invalid>';
}

function formatNames(definitions: readonly { readonly name: string }[]): string {
  return definitions
    .map(({ name }) => JSON.stringify(name))
    .sort(compareText)
    .join(', ');
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'ENOENT'
  );
}
