/**
 * CNT04-04 — not a formality. The writer having no web access is one of the
 * four containment properties in design.md §2.2, and the only one a test can
 * assert. This test fails if anyone adds web_search, web_fetch or bash to
 * the writer's tool list, gives bash to any subagent, or widens the
 * manifest's write surface.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

const here = path.dirname(fileURLToPath(import.meta.url));
const tools = JSON.parse(readFileSync(path.join(here, '..', 'tools.json'), 'utf8')) as {
  subagents: Record<string, { tools: string[] }>;
};
const manifest = parseYaml(readFileSync(path.join(here, '..', 'agent.yaml'), 'utf8')) as {
  policy: { writes: string[]; connections: string[]; approval: string };
};

describe('the writer reads the pack, not the internet', () => {
  it('writer tool list excludes web_search, web_fetch and bash', () => {
    const writerTools = tools.subagents.writer.tools;
    expect(writerTools).not.toContain('web_search');
    expect(writerTools).not.toContain('web_fetch');
    expect(writerTools).not.toContain('bash');
  });

  it('no subagent has bash', () => {
    for (const [name, sub] of Object.entries(tools.subagents)) {
      expect(sub.tools, `${name} must not have bash`).not.toContain('bash');
    }
  });
});

describe('the manifest envelope stays shut (CNT04-S1)', () => {
  it('declares no cms-publish, no email-send, no social-post', () => {
    expect(manifest.policy.writes).not.toContain('cms-publish');
    expect(manifest.policy.writes).not.toContain('email-send');
    expect(manifest.policy.writes).not.toContain('social-post');
  });

  it('declares no database connection', () => {
    for (const conn of manifest.policy.connections) {
      expect(conn).not.toMatch(/postgres|mysql|sqlite|mongo|database|db/i);
    }
  });

  it('requires pr-review approval', () => {
    expect(manifest.policy.approval).toBe('pr-review');
  });
});
