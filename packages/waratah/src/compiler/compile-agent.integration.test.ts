import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createAgent, defineTool } from '../agent/create-agent.js';
import type { AgentDefinition } from '../shared/contracts.js';
import { compileAgent } from './compile-agent.js';
import { CompilerError } from '../discover/diagnostics.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('compileAgent', () => {
  it('produces a compiled graph and deterministic paths, ordering, and hashes', async () => {
    const fixture = await createFixture();
    await writeFixtureFile(fixture, 'agent/skills/zeta/SKILL.md', 'zeta\n');
    await writeFixtureFile(fixture, 'agent/skills/alpha/SKILL.md', 'alpha\n');
    await writeFixtureFile(fixture, '.waratah/memory/MEMORY.md', 'remember\n');

    const child = createDefinition({
      name: 'analyst',
      kind: 'subagent',
      instructions: ['./instructions.md'],
      tools: [tool('z-tool'), tool('a-tool')],
    });
    const root = createDefinition({
      name: 'lead',
      instructions: ['./instructions.md'],
      tools: [tool('z-tool'), tool('a-tool')],
      channels: [
        { name: 'z-channel', description: 'Z' },
        { name: 'a-channel', description: 'A' },
      ],
      subagents: [child],
    });
    await writeFixtureFile(fixture, 'agent/subagents/analyst/agent.ts', 'export {};\n');
    await writeFixtureFile(fixture, 'agent/subagents/analyst/instructions.md', 'analyst\n');

    const first = await compileFixture(fixture, root, new Date('2026-01-01T00:00:00.000Z'));
    const firstBytes = await readFile(join(fixture, '.waratah/manifest.json'), 'utf8');
    const second = await compileFixture(fixture, root, new Date('2026-01-02T00:00:00.000Z'));
    const secondBytes = await readFile(join(fixture, '.waratah/manifest.json'), 'utf8');

    expect(first.graph).toBeDefined();
    expect(typeof first.graph.invoke).toBe('function');
    expect({ ...first.manifest, generatedAt: undefined }).toEqual({
      ...second.manifest,
      generatedAt: undefined,
    });
    expect(firstBytes.replace(first.manifest.generatedAt, '<generatedAt>')).toBe(
      secondBytes.replace(second.manifest.generatedAt, '<generatedAt>'),
    );
    expect(first.manifest.agent.tools).toEqual(['a-tool', 'z-tool']);
    expect(first.manifest.agent.channels).toEqual(['a-channel', 'z-channel']);
    expect(first.manifest.agent.schedules).toEqual([]);
    expect(first.manifest.agent.skills.map(({ path }) => path)).toEqual([
      'agent/skills/alpha/SKILL.md',
      'agent/skills/zeta/SKILL.md',
    ]);
    expect(first.manifest.agent.instructions[0]?.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(first.manifest)).not.toContain(fixture);
  });

  it('leaves a previous valid manifest unchanged when validation fails', async () => {
    const fixture = await createFixture();
    const valid = createDefinition({ name: 'lead', instructions: ['./instructions.md'] });
    await compileFixture(fixture, valid, new Date('2026-01-01T00:00:00.000Z'));
    const original = await readFile(join(fixture, '.waratah/manifest.json'), 'utf8');

    const invalidChild = createDefinition({
      name: 'analyst',
      kind: 'subagent',
      instructions: ['./instructions.md'],
      channels: [{ name: 'http', description: 'Must fail compile.' }],
    });
    const invalid = createDefinition({
      name: 'lead',
      instructions: ['./instructions.md'],
      subagents: [invalidChild],
    });
    await writeFixtureFile(fixture, 'agent/subagents/analyst/agent.ts', 'export {};\n');
    await writeFixtureFile(fixture, 'agent/subagents/analyst/instructions.md', 'analyst\n');

    await expect(compileFixture(fixture, invalid)).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: 'INVALID_CHANNEL_SCOPE' })],
    });
    expect(await readFile(join(fixture, '.waratah/manifest.json'), 'utf8')).toBe(original);
  });

  it('reports every discoverable problem in one compile run', async () => {
    const fixture = await createFixture();
    const duplicateTool = tool('duplicate');
    const child = createDefinition({
      name: 'analyst',
      kind: 'subagent',
      instructions: ['./missing.md'],
      tools: [duplicateTool, duplicateTool],
      channels: [{ name: 'http', description: 'Must fail compile.' }],
    });
    const root = createDefinition({
      name: 'lead',
      instructions: ['./also-missing.md'],
      subagents: [child, child],
    });
    await writeFixtureFile(fixture, 'agent/subagents/analyst/agent.ts', 'export {};\n');

    let failure: unknown;
    try {
      await compileFixture(fixture, root);
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(CompilerError);
    const diagnostics = (failure as CompilerError).diagnostics;
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_CHANNEL_SCOPE', agent: 'analyst' }),
        expect.objectContaining({ code: 'INVALID_AGENT', path: 'tools.duplicate' }),
        expect.objectContaining({
          code: 'INVALID_AGENT',
          path: 'subagents.analyst',
        }),
        expect.objectContaining({ code: 'INVALID_AGENT', path: './missing.md' }),
        expect.objectContaining({
          code: 'INVALID_AGENT',
          path: './also-missing.md',
        }),
      ]),
    );
    expect((failure as Error).message).toContain('Remove all channels');
    expect((failure as Error).message).toContain('file "agent/subagents/analyst/agent.ts"');
  });

  it('uses INVALID_CHANNEL_SCOPE for channels declared by a subagent', async () => {
    const fixture = await createFixture();
    const subagent = createDefinition({
      name: 'analyst',
      kind: 'subagent',
      instructions: ['./instructions.md'],
      channels: [{ name: 'http', description: 'Must fail compile.' }],
    });
    const root = createDefinition({
      name: 'lead',
      instructions: ['./instructions.md'],
      subagents: [subagent],
    });
    await writeFixtureFile(fixture, 'agent/subagents/analyst/agent.ts', 'export {};\n');
    await writeFixtureFile(fixture, 'agent/subagents/analyst/instructions.md', 'analyst\n');

    await expect(compileFixture(fixture, root)).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: 'INVALID_CHANNEL_SCOPE',
          agent: 'analyst',
          path: 'channels',
        }),
      ],
    });
  });

  it('uses INVALID_SCHEDULE_SCOPE for schedules declared by a subagent', async () => {
    const fixture = await createFixture();
    const subagent = createDefinition({
      name: 'analyst',
      kind: 'subagent',
      instructions: ['./instructions.md'],
      schedules: [{ cron: '0 8 * * *', markdown: 'Must fail compile.' }],
    });
    const root = createDefinition({
      name: 'lead',
      instructions: ['./instructions.md'],
      subagents: [subagent],
    });
    await writeFixtureFile(fixture, 'agent/subagents/analyst/agent.ts', 'export {};\n');
    await writeFixtureFile(fixture, 'agent/subagents/analyst/instructions.md', 'analyst\n');

    await expect(compileFixture(fixture, root)).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: 'INVALID_SCHEDULE_SCOPE',
          agent: 'analyst',
          path: 'schedules',
        }),
      ],
    });
  });

  it('uses INVALID_SCHEDULE_SCOPE for a schedules directory on a subagent', async () => {
    const fixture = await createFixture();
    const subagent = createDefinition({
      name: 'analyst',
      kind: 'subagent',
      instructions: ['./instructions.md'],
    });
    const root = createDefinition({
      name: 'lead',
      instructions: ['./instructions.md'],
      subagents: [subagent],
    });
    await writeFixtureFile(fixture, 'agent/subagents/analyst/agent.ts', 'export {};\n');
    await writeFixtureFile(fixture, 'agent/subagents/analyst/instructions.md', 'analyst\n');
    await writeFixtureFile(fixture, 'agent/subagents/analyst/schedules/daily.ts', 'export {};\n');

    await expect(compileFixture(fixture, root)).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: 'INVALID_SCHEDULE_SCOPE',
          agent: 'analyst',
          path: 'schedules',
          message: expect.stringContaining('schedules/ directory'),
        }),
      ],
    });
  });

  it('records lead schedule names from agent/schedules file paths', async () => {
    const fixture = await createFixture();
    await writeFixtureFile(
      fixture,
      'agent/schedules/daily-changes.ts',
      'export default { cron: "0 8 * * *", markdown: "Run." };\n',
    );
    const root = createDefinition({ name: 'lead', instructions: ['./instructions.md'] });

    const compiled = await compileFixture(fixture, root);

    expect(compiled.manifest.agent.schedules).toEqual(['daily-changes']);
  });

  it('rejects authored tools that use reserved built-in names', async () => {
    const fixture = await createFixture();

    for (const name of ['read', 'write', 'list', 'task']) {
      const definition = createDefinition({
        name: 'lead',
        instructions: ['./instructions.md'],
        tools: [tool(name)],
      });

      await expect(compileFixture(fixture, definition)).rejects.toMatchObject({
        diagnostics: [
          expect.objectContaining({
            code: 'INVALID_AGENT',
            message: expect.stringContaining(
              `The authored tool name ${JSON.stringify(name)} is reserved`,
            ),
            path: `tools.${name}`,
          }),
        ],
      });
    }

    await expect(
      compileFixture(
        fixture,
        createDefinition({
          name: 'lead',
          instructions: ['./instructions.md'],
          tools: [tool('search')],
        }),
      ),
    ).resolves.toMatchObject({ manifest: { agent: { tools: ['search'] } } });
  });

  it('resolves default skills beside agent.ts and memory under the project', async () => {
    const fixture = await createFixture();
    await writeFixtureFile(fixture, 'agent/skills/review/SKILL.md', 'review\n');
    await writeFixtureFile(fixture, '.waratah/memory/MEMORY.md', 'memory\n');
    const root = createDefinition({ name: 'lead', instructions: ['./instructions.md'] });

    const compiled = await compileFixture(fixture, root);

    expect(compiled.manifest.agent.skills.map(({ path }) => path)).toEqual([
      'agent/skills/review/SKILL.md',
    ]);
    expect(compiled.manifest.agent.memory.map(({ path }) => path)).toEqual([
      '.waratah/memory/MEMORY.md',
    ]);
  });

  it('allows missing default directories and rejects escaping symlinks', async () => {
    const fixture = await createFixture();
    const root = createDefinition({ name: 'lead', instructions: ['./instructions.md'] });
    await expect(compileFixture(fixture, root)).resolves.toMatchObject({
      manifest: { agent: { skills: [], memory: [] } },
    });

    const outside = await mkdtemp(join(tmpdir(), 'waratah-outside-'));
    temporaryDirectories.push(outside);
    await writeFile(join(outside, 'secret.md'), 'not discoverable\n');
    await symlink(join(outside, 'secret.md'), join(fixture, 'agent', 'linked.md'));
    const escaping = createDefinition({ name: 'lead', instructions: ['./linked.md'] });

    await expect(compileFixture(fixture, escaping)).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: 'INVALID_AGENT',
          message: expect.stringContaining('symlink outside'),
          path: './linked.md',
        }),
      ],
    });
  });
});

async function createFixture(): Promise<string> {
  const fixture = await mkdtemp(join(tmpdir(), 'waratah-compiler-'));
  temporaryDirectories.push(fixture);
  await writeFixtureFile(fixture, 'agent/agent.ts', 'export {};\n');
  await writeFixtureFile(fixture, 'agent/instructions.md', 'lead\n');
  return fixture;
}

async function writeFixtureFile(root: string, path: string, content: string): Promise<void> {
  const destination = join(root, path);
  await mkdir(join(destination, '..'), { recursive: true });
  await writeFile(destination, content);
}

function createDefinition(
  overrides: Partial<AgentDefinition> & Pick<AgentDefinition, 'name' | 'instructions'>,
): AgentDefinition {
  return createAgent({
    name: overrides.name,
    kind: overrides.kind,
    model: overrides.model ?? 'test-model',
    instructions: overrides.instructions,
    skills: overrides.skills,
    memory: overrides.memory,
    tools: overrides.tools ?? [],
    subagents: overrides.subagents ?? [],
    channels: overrides.channels ?? [],
    schedules: overrides.schedules,
  });
}

function tool(name: string) {
  return defineTool({
    name,
    description: `${name} tool`,
    inputSchema: { parse: (input: unknown) => input },
    execute: async (input) => input,
  });
}

function compileFixture(fixture: string, definition: AgentDefinition, generatedAt?: Date) {
  return compileAgent({
    definition,
    agentFile: join(fixture, 'agent', 'agent.ts'),
    projectRoot: fixture,
    generatedAt,
  });
}
