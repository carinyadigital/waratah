/**
 * The register rules, exercised against synthetic manifests.
 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Manifest } from '../../packages/agent-manifest/src/index';
import { coreRules, r3, r4, r5, r7, type RuleContext } from './rules';
import { r9, r10, r11 } from './rules-extra';

const connections = {
  connections: {
    cms: {
      kind: 'cms',
      owner: 'jonno',
      rotation: { cadence: 'quarterly' },
      assertion: {
        repo: 'carinyaparc/website',
        testPath: 'apps/site/src/lib/payload/agent-publish.test.ts',
        commitSha: '654236c232904172c9054c3333dfd64e91cc990f',
      },
    },
    chat: { kind: 'chat', owner: 'jonno', rotation: { cadence: 'yearly' } },
    analytics: { kind: 'analytics', owner: 'jonno', rotation: { cadence: 'yearly' } },
    search: { kind: 'search', owner: 'jonno', rotation: { cadence: 'yearly' } },
    staging_postgres: { kind: 'database', owner: 'jonno', rotation: { cadence: 'never' } },
  },
};

const manifest = (
  over: Omit<Partial<Manifest>, 'policy' | 'capability' | 'bindings'> & {
    policy?: Partial<Manifest['policy']>;
    capability?: Partial<Manifest['capability']>;
    bindings?: Manifest['bindings'];
  },
): Manifest =>
  ({
    version: 2,
    name: 'test-agent',
    team: 'content',
    owner: 'jonno',
    description: 'a test agent that does testing things',
    tags: ['test'],
    capability: { kind: 'conversational', model: 'standard', ...(over.capability ?? {}) },
    bindings: over.bindings ?? [{ provider: 'claude', mode: 'managed' }],
    triggers: [{ type: 'manual' }],
    observability: { traces: 'none', alertChannel: '#carinya-content' },
    ...over,
    policy: {
      untrustedInput: false,
      connections: [],
      writes: [],
      approval: 'draft-only',
      ...(over.policy ?? {}),
    },
  }) as Manifest;

const ctx = (m: Manifest, root = path.resolve('.')): RuleContext => ({
  root,
  manifests: [{ dir: m.name, file: `${m.name}/agent.yaml`, manifest: m }],
  connections,
});

describe('R3/R4 — the two that matter', () => {
  it('R3: untrustedInput may not pair with approval none', () => {
    const m = manifest({ policy: { untrustedInput: true, approval: 'none' } });
    expect(r3(ctx(m))).toHaveLength(1);
  });

  it('R4: consequential writes need human or pr-review approval', () => {
    const m = manifest({ policy: { writes: ['email-send'], approval: 'draft-only' } });
    expect(r4(ctx(m)).map((v) => v.rule)).toContain('R4');
    const ok = manifest({ policy: { writes: ['email-send'], approval: 'human' } });
    expect(r4(ctx(ok))).toHaveLength(0);
  });

  it("R4': a content agent may never declare cms-publish, at any approval level", () => {
    const m = manifest({ policy: { writes: ['cms-publish'], approval: 'human' } });
    expect(r4(ctx(m)).map((v) => v.rule)).toContain("R4'");
  });
});

describe('R5/R7 — scheduled and unattended writers', () => {
  it('R5: schedule trigger requires spendCapUsd on model platforms, not on github-actions', () => {
    const scheduled = manifest({
      triggers: [{ type: 'schedule', cron: '0 7 * * MON' }],
      bindings: [{ provider: 'claude', mode: 'managed', schedule: '0 7 * * MON' }],
    });
    expect(r5(ctx(scheduled))).toHaveLength(1);
    const actions = manifest({
      capability: { kind: 'deterministic', model: 'none' },
      bindings: [
        { provider: 'github-actions', mode: 'workflow', workflow: '.github/workflows/x.yml', harness: 'none' },
      ],
      triggers: [{ type: 'schedule', cron: '0 7 * * MON' }],
    });
    expect(r5(ctx(actions))).toHaveLength(0);
  });

  it('R7: unattended writers need an idempotencyKey', () => {
    const m = manifest({
      triggers: [{ type: 'schedule', cron: '0 7 * * MON' }],
      policy: { writes: ['tracker'], spendCapUsd: 10 },
    });
    expect(r7(ctx(m))).toHaveLength(1);
    const ok = manifest({
      triggers: [{ type: 'schedule', cron: '0 7 * * MON' }],
      policy: { writes: ['tracker'], spendCapUsd: 10, idempotencyKey: 'x.y' },
    });
    expect(r7(ctx(ok))).toHaveLength(0);
  });
});

describe('R9 — cms-draft implies a pinned access assertion', () => {
  it('fails without cmsRole, without a cms connection, and without an assertion pin', () => {
    const noRole = manifest({ policy: { writes: ['cms-draft'], connections: ['cms'] } });
    expect(r9(ctx(noRole))[0].message).toContain('cmsRole');

    const noCms = manifest({
      policy: { writes: ['cms-draft'], cmsRole: 'agent', connections: ['chat'] },
    });
    expect(r9(ctx(noCms))[0].message).toMatch(/kind cms/);

    const unpinned = {
      connections: {
        ...connections.connections,
        cms: { kind: 'cms', owner: 'jonno', rotation: { cadence: 'quarterly' } },
      },
    };
    const noPin = manifest({
      policy: { writes: ['cms-draft'], cmsRole: 'agent', connections: ['cms'] },
    });
    const violations = r9({
      root: path.resolve('.'),
      manifests: [{ dir: noPin.name, file: 'x', manifest: noPin }],
      connections: unpinned,
    });
    expect(violations[0].message).toMatch(/assertion/);
  });

  it('passes when the cms connection carries a well-formed pin', () => {
    const ok = manifest({
      policy: { writes: ['cms-draft'], cmsRole: 'agent', connections: ['cms'] },
    });
    expect(r9(ctx(ok))).toHaveLength(0);
  });
});

describe('R10 — no direct database access, any agent, any tag', () => {
  it('fails a connection classified database, whatever the tag', () => {
    const m = manifest({
      tags: ['engineering'],
      team: 'engineering',
      policy: { connections: ['staging_postgres'] },
    });
    const violations = r10(ctx(m));
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toMatch(/classified database/);
  });

  it('fails a database-looking connection name even if unclassified', () => {
    const m = manifest({ policy: { connections: ['prod-mysql'] } });
    expect(r10(ctx(m))[0].message).toMatch(/looks like a database/);
  });
});

describe('R11 — read emitters declare nThreshold per measurable source', () => {
  it('fails a read emitter missing a threshold for a connected analytics source', () => {
    const m = manifest({
      policy: { connections: ['analytics'] },
      extensions: { content: { emits: ['read'], nThreshold: {} } },
    });
    expect(r11(ctx(m))[0].message).toMatch(/nThreshold\.analytics/);
  });

  it('passes when every measurable source has a threshold', () => {
    const m = manifest({
      policy: { connections: ['analytics', 'search'] },
      extensions: { content: { emits: ['read'], nThreshold: { analytics: 100, search: 50 } } },
    });
    expect(r11(ctx(m))).toHaveLength(0);
  });
});

describe('the shipped register is clean', () => {
  it('R1–R13 pass over the real agents/ directory', async () => {
    const { loadManifests, loadConnections } = await import('../../packages/agent-manifest/src/index');
    const root = path.resolve(import.meta.dirname, '../..');
    const real: RuleContext = { root, manifests: loadManifests(root), connections: loadConnections(root) };
    const { extraRules } = await import('./rules-extra');
    const violations = [...coreRules, ...extraRules].flatMap((r) => r(real));
    expect(violations).toEqual([]);
  });
});
