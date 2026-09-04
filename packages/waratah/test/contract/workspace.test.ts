import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

const read = (relative: string) => readFileSync(path.join(repoRoot, relative), 'utf8');

describe('workspace layout', () => {
  it('lists packages/* and examples/* as workspace members', () => {
    const workspace = read('pnpm-workspace.yaml');

    expect(workspace).toMatch(/packages\/\*/);
    expect(workspace).toMatch(/examples\/\*/);
  });

  it('declares the LangGraph runtime package with pinned framework dependencies', () => {
    const pkg = JSON.parse(read('packages/waratah/package.json')) as {
      name: string;
      dependencies: Record<string, string>;
    };

    expect(pkg.name).toBe('waratah');
    expect(pkg.dependencies['@langchain/langgraph']).toBeDefined();
    expect(pkg.dependencies['@langchain/core']).toBeDefined();
    expect(pkg.dependencies['@langchain/langgraph-checkpoint-sqlite']).toBeDefined();
  });

  it('exports public error codes from the public barrel', async () => {
    const barrel = await import('../../src/index');

    expect(Object.keys(barrel).sort()).toEqual([
      'DEFAULT_LIMITS',
      'WaratahError',
      'compile',
      'createAgent',
      'defineCronChannel',
      'defineTool',
      'isWaratahError',
    ]);
  });
});
