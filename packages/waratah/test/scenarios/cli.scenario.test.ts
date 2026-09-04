import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const packageRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const workspaceRoot = resolve(packageRoot, '../..');
const fixtureRoot = join(workspaceRoot, 'examples', 'daily-changes');
const cliPath = join(packageRoot, 'bin', 'waratah.ts');
const tsxBin = join(workspaceRoot, 'node_modules', '.bin', 'tsx');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('waratah CLI', () => {
  it('builds a deterministic fixture manifest and reports disjoint tool scopes', async () => {
    const projectRoot = await copyFixture();

    await runCli('build', projectRoot);
    const first = JSON.parse(await readFile(join(projectRoot, '.waratah', 'manifest.json'), 'utf8'));
    const info = await runCli('info', projectRoot);
    await runCli('build', projectRoot);
    const second = JSON.parse(
      await readFile(join(projectRoot, '.waratah', 'manifest.json'), 'utf8'),
    );

    expect(first.schemaVersion).toBe(1);
    expect(withoutGeneratedAt(first)).toEqual(withoutGeneratedAt(second));
    expect(info.stdout).toContain('Lead: daily-changes (lead)');
    expect(info.stdout).toContain('Tools: slack-post');
    expect(info.stdout).toContain('Subagent: systems-analyst (subagent)');
    expect(info.stdout).toContain('Tools: git-reader');
    expect(first.agent.tools).not.toContain('git-reader');
    expect(first.agent.subagents[0].tools).not.toContain('slack-post');
  });

  it('prints every compiler diagnostic and exits non-zero', async () => {
    const projectRoot = await copyFixture();
    const subagentPath = join(projectRoot, 'agent', 'subagents', 'systems-analyst', 'agent.ts');
    const source = await readFile(subagentPath, 'utf8');
    await writeFile(
      subagentPath,
      source.replace(
        'channels: [],',
        "channels: [{ name: 'cron', description: 'Must fail compile.' }],",
      ),
    );

    await expect(runCli('build', projectRoot)).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('Agent compilation failed with 1 diagnostic.'),
    });

    try {
      await runCli('build', projectRoot);
    } catch (error) {
      const stderr = (error as { readonly stderr: string }).stderr;
      expect(stderr).toContain('INVALID_CHANNEL_SCOPE');
      expect(stderr).toContain('agent "systems-analyst"');
      expect(stderr).toContain('file "agent/subagents/systems-analyst/agent.ts"');
      expect(stderr).toContain('path "channels"');
    }
  });

  it('tells the operator to build before requesting info', async () => {
    const projectRoot = await copyFixture();

    await expect(runCli('info', projectRoot)).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('Run "waratah build'),
    });
  });

  it.each([
    [['--bogus-flag'], "Unknown option '--bogus-flag'"],
    [['bogus-command'], 'Unknown command "bogus-command".'],
  ])('reports invalid usage without a stack trace', async (arguments_, message) => {
    await expect(runCli(...arguments_)).rejects.toMatchObject({
      code: 2,
      stderr: expect.stringContaining(message),
    });

    try {
      await runCli(...arguments_);
    } catch (error) {
      const stderr = (error as { readonly stderr: string }).stderr;
      expect(stderr).toContain('Usage:');
      expect(stderr).toContain('waratah build [directory]');
      expect(stderr).toContain('waratah info [directory]');
      expect(stderr).toContain('-h, --help');
      expect(stderr).not.toContain('\n    at ');
    }
  });
});

async function copyFixture(): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), 'waratah-scenario-'));
  temporaryDirectories.push(projectRoot);
  await cp(join(fixtureRoot, 'agent'), join(projectRoot, 'agent'), { recursive: true });
  await mkdir(join(projectRoot, 'node_modules'));
  await symlink(packageRoot, join(projectRoot, 'node_modules', 'waratah'), 'dir');
  return projectRoot;
}

async function runCli(...arguments_: readonly string[]) {
  return execFileAsync(tsxBin, [cliPath, ...arguments_], {
    cwd: workspaceRoot,
  });
}

function withoutGeneratedAt(manifest: Record<string, unknown>): Record<string, unknown> {
  const { generatedAt: _generatedAt, ...deterministic } = manifest;
  return deterministic;
}
