import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml, stringify as toYaml } from 'yaml';
import { OpportunitiesBuilder } from '../agent/opportunities';
import { commission, TargetQueryCollisionError, type CommissionInput } from '../agent/commission';
import { loadQueue, promote, PromotionDeniedError } from '../agent/queue';
import { Triage } from '../../content-monitor/agent/triage';
import type { ClaimPolicy } from '../../../packages/content-pipeline/src/gates/types';

const HASH = 'a'.repeat(64);
const policy: ClaimPolicy = {
  prohibited: [{ id: 'carbon-neutral', pattern: 'carbon[ -]?neutral|net[ -]?zero', reason: 'no certified accounting' }],
  categories: [],
};

const builder = () =>
  new OpportunitiesBuilder('2026-08', HASH, policy, { reads: ['.agency/content/reads/2026-W31.yaml'] });

const candidate = (over: Partial<Parameters<OpportunitiesBuilder['propose']>[0]> = {}) => ({
  title: 'How to read a soil test without a consultant',
  targetQuery: 'how to read a soil test',
  surface: 'blog' as const,
  bet: 'Practitioner-cluster demand is unserved; this converts practitioners at above-cluster rate within 90 days.',
  evidence: [{ artifact: '.agency/content/reads/2026-W31.yaml', ref: 'finding-0' }],
  ...over,
});

describe('synthesis (CNT07-S2)', () => {
  it('refuses synthesis with no input artifacts', () => {
    expect(() => new OpportunitiesBuilder('2026-08', HASH, policy, {})).toThrow(/opinion/);
  });

  it('an opportunity carries evidence and a stated bet, or it does not exist', () => {
    expect(() => builder().propose(candidate({ evidence: [] }))).toThrow(/evidence/);
    expect(() => builder().propose(candidate({ bet: 'people like soil' }))).toThrow(/bet/);
  });

  it('a candidate contradicting positioning is excluded with the reason named', () => {
    const b = builder();
    expect(b.propose(candidate({ title: 'Why we are going carbon neutral by 2027', bet: 'A carbon neutral pledge piece would draw links from sustainability roundups.' }))).toBe('excluded');
    expect(b.propose(candidate())).toBe('ranked');
    const artifact = b.build();
    expect(artifact.opportunities).toHaveLength(1);
    expect(artifact.excluded[0].reason).toContain('carbon-neutral');
  });

  it('writes a schema-valid opportunities artifact', () => {
    const contentDir = path.join(mkdtempSync(path.join(tmpdir(), 'planner-')), 'content');
    const b = builder();
    b.propose(candidate());
    b.exclude('A listicle of farm quotes', 'no evidence of demand; off-positioning depth game');
    const file = b.writeTo(contentDir);
    const artifact = parseYaml(readFileSync(file, 'utf8'));
    expect(artifact.opportunities[0].id).toMatch(/^opp-/);
    expect(artifact.excluded).toHaveLength(1);
  });
});

const scaffoldRepo = () => {
  const root = mkdtempSync(path.join(tmpdir(), 'commission-'));
  mkdirSync(path.join(root, '.agency/content/briefs'), { recursive: true });
  return root;
};

const commissionInput = (over: Partial<CommissionInput> = {}): CommissionInput => ({
  opportunity: candidate() as CommissionInput['opportunity'] & { id: string },
  angle: 'the consultant-free walkthrough of a real report',
  audience: 'practitioners restoring ground',
  mustSupport: [{ claim: 'Soil test interpretation thresholds for pasture are published by state agriculture departments' }],
  mustNotClaim: ['guarantee\\w*'],
  internalLinks: ['measuring-soil-carbon-baseline'],
  sourceBudget: 6,
  successMetric: 'practitioner-cluster subscriber conversion over 90 days',
  positioningHash: HASH,
  ...over,
});

// give the opportunity an id like the builder would
const withId = (input: CommissionInput): CommissionInput => ({
  ...input,
  opportunity: { id: 'opp-how-to-read-a-soil-test', ...input.opportunity },
});

describe('commissioning (CNT07-S3)', () => {
  it('an opportunity becomes a schema-valid brief with positioningHash and expiresAt set', () => {
    const root = scaffoldRepo();
    const result = commission(root, withId(commissionInput()), new Date('2026-08-01'));
    const brief = parseYaml(readFileSync(result.briefFile, 'utf8'));
    expect(brief.positioningHash).toBe(HASH);
    expect(brief.expiresAt).toBe('2026-10-30');
    expect(brief.trackerRef).toBe(result.trackerRef);
  });

  it('a targetQuery collision with an existing brief is refused at write', () => {
    const root = scaffoldRepo();
    writeFileSync(
      path.join(root, '.agency/content/briefs/existing-piece.yaml'),
      toYaml({ slug: 'existing-piece', targetQuery: 'How to Read a Soil Test' }),
    );
    expect(() => commission(root, withId(commissionInput()))).toThrow(TargetQueryCollisionError);
  });
});

describe('the capped, human-promoted queue (CNT07-S4)', () => {
  it('the commissioner files to Triage and never writes the queue', () => {
    const root = scaffoldRepo();
    writeFileSync(path.join(root, '.agency/content/queue.yaml'), toYaml({ cap: 1, ready: [] }));
    const result = commission(root, withId(commissionInput()), new Date('2026-08-01'));
    expect(result.filedTo).toBe('triage');
    expect(new Triage(root).get(`brief-${result.slug}`)!.kind).toBe('proposed-brief');
    // queue untouched by commissioning
    expect(loadQueue(path.join(root, '.agency/content')).ready).toEqual([]);
  });

  it('promotion requires a named human; agent-shaped names are refused', () => {
    const root = scaffoldRepo();
    const contentDir = path.join(root, '.agency/content');
    const { slug } = commission(root, withId(commissionInput()), new Date('2026-08-01'));
    writeFileSync(path.join(contentDir, 'queue.yaml'), toYaml({ cap: 2, ready: [] }));

    expect(() => promote(contentDir, slug, 'content-planner')).toThrow(PromotionDeniedError);
    expect(() => promote(contentDir, slug, 'ci')).toThrow(PromotionDeniedError);
    expect(promote(contentDir, slug, 'Jonno').ready).toContain(slug);
  });

  it('promotion past the cap is refused, even for a human', () => {
    const root = scaffoldRepo();
    const contentDir = path.join(root, '.agency/content');
    const a = commission(root, withId(commissionInput()), new Date('2026-08-01'));
    const b = commission(
      root,
      withId(
        commissionInput({
          opportunity: { ...candidate(), title: 'Planting a shelterbelt that survives', targetQuery: 'shelterbelt planting guide' } as never,
        }),
      ),
      new Date('2026-08-01'),
    );
    writeFileSync(path.join(contentDir, 'queue.yaml'), toYaml({ cap: 1, ready: [] }));
    promote(contentDir, a.slug, 'Jonno');
    expect(() => promote(contentDir, b.slug, 'Jonno')).toThrow(/cap/);
  });
});
