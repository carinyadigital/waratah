import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkBriefAndPack,
  checkDecay,
  checkInternalLinkGraph,
  checkMustSupportStillResolves,
  checkPositioningHash,
  checkPublishedHasReview,
  checkSourceFreshness,
  checkTargetQueryUniqueness,
  type CorpusDoc,
} from '../agent/invariants';
import { Triage, idempotencyKey } from '../agent/triage';
import type { BriefArtifact, PackArtifact, SurfaceSpec } from '../../../packages/content-pipeline/src/gates/types';

const doc = (slug: string, over: Partial<CorpusDoc> = {}): CorpusDoc => ({
  slug,
  surface: 'blog',
  content: {
    root: {
      type: 'root',
      children: [{ type: 'paragraph', children: [{ type: 'text', text: `content of ${slug}` }] }],
    },
  },
  ...over,
});

const withLinkTo = (slug: string, target: string): CorpusDoc => ({
  ...doc(slug),
  content: {
    root: {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'link', fields: { url: `/${target}` }, children: [{ type: 'text', text: target }] }],
        },
      ],
    },
  },
});

const brief = (slug: string, targetQuery: string): BriefArtifact =>
  ({ slug, targetQuery }) as BriefArtifact;

describe('triage idempotency', () => {
  it('filing twice for an unresolved violation produces no duplicate', () => {
    const triage = new Triage(mkdtempSync(path.join(tmpdir(), 'triage-')));
    expect(triage.fileViolation('target-query-unique', 'a+b', 'collision', 'evidence')).toBe('filed');
    expect(triage.fileViolation('target-query-unique', 'a+b', 'collision', 'evidence')).toBe('duplicate');
    expect(triage.list()).toHaveLength(1);
  });

  it('a resolved violation re-detected files fresh', () => {
    const triage = new Triage(mkdtempSync(path.join(tmpdir(), 'triage-')));
    triage.fileViolation('source-age', 'page', 'stale', 'evidence');
    triage.resolve(idempotencyKey('source-age', 'page'));
    expect(triage.fileViolation('source-age', 'page', 'stale again', 'evidence')).toBe('filed');
  });
});

describe('slug join and orphans, both directions', () => {
  it('published page without brief or pack is flagged; brief without any document is orphaned', () => {
    const violations = checkBriefAndPack([doc('published-page')], ['other-brief'], [], ['published-page']);
    const kinds = violations.map((v) => v.invariant);
    expect(kinds).toContain('published-has-brief');
    expect(kinds).toContain('published-has-pack');
    expect(kinds).toContain('brief-orphaned');
    expect(violations.find((v) => v.invariant === 'brief-orphaned')!.page).toBe('other-brief');
  });
});

describe('published pages have a review record', () => {
  it('a published page with no review record is flagged; a reviewed one is not', () => {
    const violations = checkPublishedHasReview([doc('reviewed'), doc('unreviewed')], ['reviewed']);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ invariant: 'published-has-review', page: 'unreviewed' });
  });
});

describe('the cannibalisation check', () => {
  it('two briefs targeting one query are flagged, case-insensitively', () => {
    const violations = checkTargetQueryUniqueness([
      brief('a', 'Soil Carbon Measurement'),
      brief('b', 'soil carbon measurement'),
      brief('c', 'a different query'),
    ]);
    expect(violations).toHaveLength(1);
    expect(violations[0].evidence).toContain('a, b');
  });
});

describe('internal link graph', () => {
  it('a page with no inbound links is flagged; linked pages are not', () => {
    const corpus = [withLinkTo('a', 'b'), doc('b'), doc('orphan')];
    const violations = checkInternalLinkGraph(corpus);
    expect(violations.map((v) => v.page).sort()).toEqual(['a', 'orphan']);
  });
});

describe('source freshness per claim-policy category', () => {
  const policy = {
    prohibited: [],
    categories: [{ id: 'environmental-outcome', maxSourceAgeMonths: 12, patterns: ['soil (organic )?carbon'] }],
  };
  const pack = (verifiedAt: string): PackArtifact => ({
    slug: 'p',
    entries: [
      { id: 'c1', claim: 'soil carbon rose', source: 'https://x.org', excerpt: 'e', confidence: 'high', verifiedAt },
    ],
    couldNotVerify: [],
  });

  it('flags a regulated claim whose source is older than its limit', () => {
    const violations = checkSourceFreshness([pack('2024-01-01')], policy, new Date('2026-07-31'));
    expect(violations).toHaveLength(1);
    expect(violations[0].invariant).toBe('source-age');
  });

  it('passes a fresh source and ignores unregulated claims', () => {
    expect(checkSourceFreshness([pack('2026-06-01')], policy, new Date('2026-07-31'))).toHaveLength(0);
    const unregulated: PackArtifact = {
      slug: 'p',
      entries: [{ id: 'c1', claim: 'the oven runs at 140C', source: 'https://x.org', excerpt: 'e', confidence: 'high', verifiedAt: '2020-01-01' }],
      couldNotVerify: [],
    };
    expect(checkSourceFreshness([unregulated], policy, new Date('2026-07-31'))).toHaveLength(0);
  });
});

describe('positioning hash and decay half-life', () => {
  it('flags pages written under a previous positioning hash', () => {
    const current = 'b'.repeat(64);
    const violations = checkPositioningHash(
      [doc('stale', { positioningHash: 'a'.repeat(64) }), doc('fresh', { positioningHash: current })],
      current,
    );
    expect(violations.map((v) => v.page)).toEqual(['stale']);
  });

  it('flags pages unreviewed past their surface half-life, honouring lastReviewedAt', () => {
    const surfaces: Record<string, SurfaceSpec> = {
      blog: { id: 'blog', readability: { minFlesch: 0, maxFlesch: 100 }, words: { min: 1, max: 10 }, decayHalfLifeMonths: 18, requiresInternalLinks: true, canonical: true },
    };
    const now = new Date('2026-07-31');
    const old = doc('old', { publishedAt: '2024-01-01' });
    const oldButReviewed = doc('reviewed', { publishedAt: '2024-01-01', lastReviewedAt: '2026-06-01' });
    const violations = checkDecay([old, oldButReviewed], surfaces, now);
    expect(violations.map((v) => v.page)).toEqual(['old']);
  });
});

describe('mustSupport still resolves on the live corpus', () => {
  it('flags a mustSupport annotation deleted during a human edit', () => {
    const pack: PackArtifact = {
      slug: 'p',
      entries: [{ id: 'c1', claim: 'kept claim', source: 'https://x.org', excerpt: 'e', confidence: 'high', verifiedAt: '2026-06-01', mustSupport: true }],
      couldNotVerify: [],
    };
    const violations = checkMustSupportStillResolves([doc('p')], [pack]);
    expect(violations).toHaveLength(1);
    expect(violations[0].invariant).toBe('must-support-resolves');
  });
});
