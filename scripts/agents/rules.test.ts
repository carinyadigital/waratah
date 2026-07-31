/**
 * The register rules, exercised against synthetic manifests. R1–R8 ship with
 * the register; R9–R11 with the generalisation epic; R12 arrives with the
 * calibration ledger.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Manifest } from '../../packages/agent-manifest/src/index';
import { coreRules, r3, r4, r5, r7, type RuleContext } from './rules';
import { r9, r10, r11 } from './rules-extra';

const connections = {
  connections: {
    payload: { kind: 'cms', owner: 'greg', rotation: { cadence: 'quarterly' } },
    slack: { kind: 'chat', owner: 'greg', rotation: { cadence: 'yearly' } },
    ga4: { kind: 'analytics', owner: 'greg', rotation: { cadence: 'yearly' } },
    gsc: { kind: 'search', owner: 'greg', rotation: { cadence: 'yearly' } },
    staging_postgres: { kind: 'database', owner: 'greg', rotation: { cadence: 'never' } },
  },
};

const manifest = (over: Partial<Manifest> & { policy?: Partial<Manifest['policy']> }): Manifest =>
  ({
    version: 1,
    name: 'test-agent',
    owner: 'greg',
    description: 'a test agent that does testing things',
    tags: ['content'],
    deploy: { platform: 'claude-managed-agent' },
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

const ctx = (m: Manifest, root = '/nonexistent'): RuleContext => ({
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
    const scheduled = manifest({ triggers: [{ type: 'schedule', cron: '0 7 * * MON' }] });
    expect(r5(ctx(scheduled))).toHaveLength(1);
    const actions = manifest({
      deploy: { platform: 'github-actions', workflow: '.github/workflows/x.yml', harness: 'none' },
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

describe('R9 — cms-draft implies an asserted role', () => {
  it('fails without cmsRole, without cmsRoleAssertedBy, and when the named test is absent', () => {
    const noRole = manifest({ policy: { writes: ['cms-draft'], connections: ['payload'] } });
    expect(r9(ctx(noRole))[0].message).toContain('cmsRole');

    const noTest = manifest({ policy: { writes: ['cms-draft'], cmsRole: 'agent' } });
    expect(r9(ctx(noTest))[0].message).toContain('cmsRoleAssertedBy');

    const missingFile = manifest({
      policy: { writes: ['cms-draft'], cmsRole: 'agent', cmsRoleAssertedBy: 'tests/access/gone.test.ts' },
    });
    expect(r9(ctx(missingFile))[0].message).toContain('does not exist');
  });

  it('passes when the named assertion test exists in the repo', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'r9-'));
    mkdirSync(path.join(root, 'tests/access'), { recursive: true });
    writeFileSync(path.join(root, 'tests/access/agent-publish.test.ts'), '// assertion');
    const ok = manifest({
      policy: { writes: ['cms-draft'], cmsRole: 'agent', cmsRoleAssertedBy: 'tests/access/agent-publish.test.ts' },
    });
    expect(r9(ctx(ok, root))).toHaveLength(0);
  });
});

describe('R10 — no direct database access, any agent, any tag', () => {
  it('fails a connection classified database, whatever the tag', () => {
    const m = manifest({ tags: ['engineering'], policy: { connections: ['staging_postgres'] } });
    const violations = r10(ctx(m));
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain('ADR-0003');
  });

  it('fails a database-looking connection name even if unclassified', () => {
    const m = manifest({ policy: { connections: ['prod-mysql'] } });
    expect(r10(ctx(m))).toHaveLength(1);
  });

  it('passes CMS-over-REST', () => {
    const m = manifest({ policy: { connections: ['payload'] } });
    expect(r10(ctx(m))).toHaveLength(0);
  });
});

describe('R11 — the content block becomes real', () => {
  it('an agent emitting read must declare nThreshold for every measurable source', () => {
    const m = manifest({
      policy: { connections: ['ga4', 'gsc', 'slack'], writes: ['artifact-store'] },
      content: { emits: ['read'], nThreshold: { ga4: 400 } },
    });
    const violations = r11(ctx(m));
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain('gsc');
  });

  it('passes with a threshold per measurable source; chat sources need none', () => {
    const m = manifest({
      policy: { connections: ['ga4', 'gsc', 'slack'], writes: ['artifact-store'] },
      content: { emits: ['read'], nThreshold: { ga4: 400, gsc: 200 } },
    });
    expect(r11(ctx(m))).toHaveLength(0);
  });

  it('non-read agents are untouched', () => {
    const m = manifest({ content: { emits: ['brief'] } });
    expect(r11(ctx(m))).toHaveLength(0);
  });
});

describe('the shipped register is clean', () => {
  it('R1–R8 pass over the real agents/ directory', async () => {
    const { loadManifests, loadConnections } = await import('../../packages/agent-manifest/src/index');
    const root = path.resolve(__dirname, '../..');
    const real: RuleContext = { root, manifests: loadManifests(root), connections: loadConnections(root) };
    const violations = coreRules.flatMap((r) => r(real));
    expect(violations).toEqual([]);
  });
});
