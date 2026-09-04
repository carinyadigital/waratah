import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workspaceRoot = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const fixtureRoot = join(workspaceRoot, 'examples', 'daily-changes');

describe('external fixture import contract', () => {
  it('imports waratah APIs from the package root only', async () => {
    const sources = await readTypeScriptSources(join(fixtureRoot, 'agent'));
    const waratahImports = sources.flatMap(({ content }) => findWaratahImports(content));

    expect(waratahImports.length).toBeGreaterThan(0);
    expect(findDeepImports(waratahImports)).toEqual([]);
  });

  it('does not import LangGraph from the authored fixture', async () => {
    const sources = await readTypeScriptSources(join(fixtureRoot, 'agent'));
    const langGraphImports = sources.flatMap(({ content }) =>
      [...content.matchAll(/\b(?:from\s*|import\s*(?:\(\s*)?)["'](@langchain\/[^"']*)["']/g)].map(
        (match) => match[1] ?? '',
      ),
    );

    expect(langGraphImports).toEqual([]);
  });

  it('rejects a deep waratah import', () => {
    const source = 'import { createAgent } from "waratah/src/agent/create-agent.js";';

    expect(findDeepImports(findWaratahImports(source))).toEqual([
      'waratah/src/agent/create-agent.js',
    ]);
  });
});

function findWaratahImports(source: string): readonly string[] {
  return [...source.matchAll(/\b(?:from\s*|import\s*(?:\(\s*)?)["'](waratah[^"']*)["']/g)].map(
    (match) => match[1] ?? '',
  );
}

function findDeepImports(imports: readonly string[]): readonly string[] {
  return imports.filter((specifier) => specifier !== 'waratah');
}

async function readTypeScriptSources(
  directory: string,
): Promise<readonly { readonly content: string }[]> {
  const sources: { content: string }[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      sources.push(...(await readTypeScriptSources(path)));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      sources.push({ content: await readFile(path, 'utf8') });
    }
  }
  return sources;
}
