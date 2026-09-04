import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createAgent } from '../agent/create-agent.js';
import { loadSessionStartContent } from './load.js';
import { resolveDefaultMemoryPath } from './resolve-path.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('session-start content loading', () => {
  it('loads project AGENTS.md, default memory, and default skills', async () => {
    const fixture = await createFixture();
    await writeFixtureFile(fixture, 'AGENTS.md', 'project rules\n');
    await writeFixtureFile(fixture, 'packages/AGENTS.md', 'nested rules\n');
    await writeFixtureFile(fixture, '.waratah/memory/MEMORY.md', 'remember this\n');
    await writeFixtureFile(fixture, 'agent/skills/review/SKILL.md', 'review carefully\n');

    const loaded = await loadFixture(fixture);

    expect(loaded.agents).toEqual([
      { path: 'AGENTS.md', content: 'project rules\n' },
      { path: 'packages/AGENTS.md', content: 'nested rules\n' },
    ]);
    expect(loaded.memory).toEqual([
      { path: '.waratah/memory/MEMORY.md', content: 'remember this\n' },
    ]);
    expect(loaded.skills).toEqual([
      { path: 'agent/skills/review/SKILL.md', content: 'review carefully\n' },
    ]);
  });

  it('uses explicit source arrays instead of the defaults', async () => {
    const fixture = await createFixture();
    await writeFixtureFile(fixture, '.waratah/memory/MEMORY.md', 'default memory\n');
    await writeFixtureFile(fixture, 'agent/skills/default/SKILL.md', 'default skill\n');
    await writeFixtureFile(fixture, 'agent/private-memory.md', 'override memory\n');
    await writeFixtureFile(fixture, 'agent/other-skills/custom.md', 'override skill\n');

    const loaded = await loadFixture(fixture, {
      memory: ['./private-memory.md'],
      skills: ['./other-skills/'],
    });

    expect(loaded.memory).toEqual([
      { path: 'agent/private-memory.md', content: 'override memory\n' },
    ]);
    expect(loaded.skills).toEqual([
      { path: 'agent/other-skills/custom.md', content: 'override skill\n' },
    ]);
  });

  it('keeps empty arrays disabled and allows missing default sources', async () => {
    const fixture = await createFixture();

    await expect(loadFixture(fixture, { memory: [], skills: [] })).resolves.toMatchObject({
      memory: [],
      skills: [],
    });
    await expect(loadFixture(fixture)).resolves.toMatchObject({ memory: [], skills: [] });
  });

  it('rejects explicit traversal and symlinks outside the project', async () => {
    const fixture = await createFixture();
    const outside = await createFixture('waratah-outside-');
    await writeFixtureFile(outside, 'secret.md', 'not loadable\n');
    await symlink(join(outside, 'secret.md'), join(fixture, 'agent', 'linked.md'));

    await expect(loadFixture(fixture, { skills: ['../../outside.md'] })).rejects.toMatchObject({
      code: 'INVALID_AGENT',
    });
    await expect(loadFixture(fixture, { memory: ['./linked.md'] })).rejects.toMatchObject({
      code: 'INVALID_AGENT',
    });
  });

  it('prunes ignored project directories at every depth', async () => {
    const fixture = await createFixture();
    await writeFixtureFile(fixture, 'packages/app/AGENTS.md', 'project guidance\n');
    await writeFixtureFile(fixture, 'packages/app/node_modules/pkg/AGENTS.md', 'dependency\n');
    await writeFixtureFile(fixture, 'packages/app/.git/nested/AGENTS.md', 'git metadata\n');
    await writeFixtureFile(fixture, 'packages/app/.waratah/generated/AGENTS.md', 'generated\n');

    await expect(loadFixture(fixture)).resolves.toMatchObject({
      agents: [{ path: 'packages/app/AGENTS.md', content: 'project guidance\n' }],
    });
  });
});

describe('worktree-aware default memory resolution', () => {
  it('shares the primary repository memory with a corroborated linked worktree', async () => {
    const { primary, worktree } = await createLinkedWorktree();
    await writeFixtureFile(primary, '.waratah/memory/MEMORY.md', 'shared memory\n');

    await expect(resolveDefaultMemoryPath(worktree)).resolves.toBe(await memoryPath(primary));
    await expect(loadFixture(worktree)).resolves.toMatchObject({
      memory: [{ path: '.waratah/memory/MEMORY.md', content: 'shared memory\n' }],
    });
  });

  it('uses project-local memory when the project has no Git metadata', async () => {
    const fixture = await createFixture('waratah-bare-');
    await writeFixtureFile(fixture, '.waratah/memory/MEMORY.md', 'local memory\n');

    await expect(resolveDefaultMemoryPath(fixture)).resolves.toBe(await memoryPath(fixture));
    await expect(loadFixture(fixture)).resolves.toMatchObject({
      memory: [{ path: '.waratah/memory/MEMORY.md', content: 'local memory\n' }],
    });
  });

  it('falls back for an absolute pointer with no back-reference', async () => {
    const project = await createFixture('waratah-project-');
    const outside = await createOutsideRepository();
    await writeFixtureFile(
      project,
      '.git',
      `gitdir: ${join(outside, '.git', 'worktrees', 'topic')}\n`,
    );
    await writeFixtureFile(project, '.waratah/memory/MEMORY.md', 'project memory\n');

    await expect(resolveDefaultMemoryPath(project)).resolves.toBe(await memoryPath(project));
    const loaded = await loadFixture(project);
    expect(loaded.memory).toEqual([{ path: '.waratah/memory/MEMORY.md', content: 'project memory\n' }]);
    expect(JSON.stringify(loaded)).not.toContain('outside secret');
  });
});

interface LinkedWorktree {
  readonly primary: string;
  readonly worktree: string;
  readonly metadata: string;
}

async function createLinkedWorktree(): Promise<LinkedWorktree> {
  const primary = await createFixture('waratah-primary-');
  const worktree = await createFixture('waratah-worktree-');
  const metadata = join(primary, '.git', 'worktrees', 'topic');
  await writeGitDirectory(primary);
  await writeWorktreeMetadata(metadata, '../..', join(worktree, '.git'));
  await writeFixtureFile(worktree, '.git', `gitdir: ${metadata}\n`);
  return { primary, worktree, metadata };
}

async function writeWorktreeMetadata(
  metadata: string,
  commonDirectory: string,
  backReference: string,
): Promise<void> {
  await mkdir(metadata, { recursive: true });
  await writeFile(join(metadata, 'commondir'), `${commonDirectory}\n`);
  await writeFile(join(metadata, 'gitdir'), `${backReference}\n`);
}

async function createOutsideRepository(): Promise<string> {
  const outside = await createFixture('waratah-outside-');
  await writeGitDirectory(outside);
  await mkdir(join(outside, '.git', 'worktrees', 'topic'), { recursive: true });
  await writeFile(join(outside, '.git', 'worktrees', 'topic', 'commondir'), '../..\n');
  await writeFixtureFile(outside, '.waratah/memory/MEMORY.md', 'outside secret\n');
  return outside;
}

async function writeGitDirectory(root: string): Promise<void> {
  await mkdir(join(root, '.git', 'objects'), { recursive: true });
  await writeFile(join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');
}

async function memoryPath(root: string): Promise<string> {
  return join(await realpath(root), '.waratah', 'memory', 'MEMORY.md');
}

async function createFixture(prefix = 'waratah-memory-'): Promise<string> {
  const fixture = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(fixture);
  await writeFixtureFile(fixture, 'agent/agent.ts', 'export {};\n');
  return fixture;
}

async function writeFixtureFile(root: string, path: string, content: string): Promise<void> {
  const destination = join(root, path);
  await mkdir(join(destination, '..'), { recursive: true });
  await writeFile(destination, content);
}

function loadFixture(
  fixture: string,
  overrides: { readonly memory?: readonly string[]; readonly skills?: readonly string[] } = {},
) {
  const definition = createAgent({
    name: 'lead',
    model: 'test-model',
    instructions: ['./instructions.md'],
    memory: overrides.memory,
    skills: overrides.skills,
    tools: [],
    subagents: [],
    channels: [],
  });

  return loadSessionStartContent({
    definition,
    agentFile: join(fixture, 'agent', 'agent.ts'),
    projectRoot: fixture,
  });
}
