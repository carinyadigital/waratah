import { describe, expect, it, vi } from 'vitest';
import { anchorDocument, anchorParagraph, UnknownClaimIdError } from '../agent/anchor';
import { gateLoop } from '../agent/gateLoop';
import { PackCollector, SourceBudgetExceededError } from '../agent/pack';
import { renderRunReport } from '../agent/runReport';
import { stageDraft } from '../agent/stage';
import { collectClaims, textOf } from '../../../packages/content-pipeline/src/lexical/claim';
import { computeEdit } from '../../../packages/content-pipeline/src/review';
import type {
  BrandDist,
  BriefArtifact,
  DraftArtifact,
  PackArtifact,
} from '../../../packages/content-pipeline/src/gates/types';

const pack: PackArtifact = {
  slug: 'test-piece',
  entries: [
    {
      id: 'c1',
      claim: 'A sourced number',
      source: 'https://example.org/study',
      excerpt: 'the number, measured',
      confidence: 'high',
      verifiedAt: '2026-07-01',
      mustSupport: true,
    },
  ],
  couldNotVerify: [{ claim: 'a locality figure', note: 'state data only' }],
};

describe('claim anchoring', () => {
  it('converts [[cN:text]] markers into claim nodes bound to pack entry ids', () => {
    const nodes = anchorParagraph('We measured. [[c1:the number rose]] across paddocks.', pack);
    const claimNodes = nodes.filter((n) => n.type === 'claim');
    expect(claimNodes).toHaveLength(1);
    expect((claimNodes[0] as { claimId: string }).claimId).toBe('c1');
    const docText = nodes.map((n) => textOf(n)).join('');
    expect(docText).toContain('the number rose');
  });

  it('refuses a marker bound to no pack entry', () => {
    expect(() => anchorParagraph('bad [[c9:unsourced]] claim', pack)).toThrow(UnknownClaimIdError);
  });

  it('converts markdown links and assembles sections', () => {
    const doc = anchorDocument(
      [
        { heading: { tag: 'h2', text: 'The numbers' }, paragraphs: ['See [the baseline](/baseline-post). [[c1:it rose]]'] },
      ],
      pack,
    );
    expect(collectClaims(doc)).toHaveLength(1);
    const linkNodes = doc.root.children!.flatMap((c) => c.children ?? []).filter((n) => n.type === 'link');
    expect(linkNodes).toHaveLength(1);
  });
});

describe('the gate loop', () => {
  const brand: BrandDist = {
    positioning: { hash: 'a'.repeat(64) },
    claimPolicy: { prohibited: [], categories: [] },
    bannedWords: { banned: [{ term: 'leverage', reason: 'filler' }] },
    surfaces: {
      blog: {
        id: 'blog',
        readability: { minFlesch: 0, maxFlesch: 150 },
        words: { min: 1, max: 5000 },
        decayHalfLifeMonths: 18,
        requiresInternalLinks: false,
        canonical: true,
      },
    },
  };
  const brief: BriefArtifact = {
    slug: 'test-piece',
    trackerRef: 'CON-9',
    surface: 'blog',
    targetQuery: 'test query',
    angle: 'test angle',
    audience: 'test audience',
    mustSupport: [],
    mustNotClaim: [],
    internalLinks: [],
    sourceBudget: 5,
    successMetric: 'test metric',
    positioningHash: 'a'.repeat(64),
    expiresAt: '2026-10-01',
  };
  const draftWith = (text: string): DraftArtifact => ({
    slug: 'test-piece',
    title: 'Test piece',
    surface: 'blog',
    content: { root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text }] }] } },
  });
  const input = (text: string) => ({
    slug: 'test-piece',
    draft: draftWith(text),
    brief,
    pack: { slug: 'test-piece', entries: [], couldNotVerify: [] },
    brand,
    options: { externalLinks: 'skip' as const },
  });

  it('iterates until gates pass and reports attempts', async () => {
    const reviser = vi.fn().mockImplementation(() => draftWith('Clean text now. It reads fine.'));
    const report = await gateLoop(input('We leverage things.'), reviser, 3);
    expect(report.ok).toBe(true);
    expect(report.attempts).toBe(2);
    expect(reviser).toHaveBeenCalledTimes(1);
  });

  it('stops at the retry budget and names the gate it cannot satisfy', async () => {
    const reviser = vi.fn().mockImplementation((d: DraftArtifact) => d); // unhelpful reviser
    const report = await gateLoop(input('We leverage things.'), reviser, 3);
    expect(report.ok).toBe(false);
    expect(report.attempts).toBe(3);
    expect(report.unsatisfied.map((u) => u.gate)).toContain('style-lint');
    expect(report.unsatisfied.find((u) => u.gate === 'style-lint')!.failures.join(' ')).toContain('leverage');
  });
});

describe('REST staging as the agent identity', () => {
  it('creates a draft with the API key header and draft=true, never touching _status published', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes('where[slug]')) return new Response(JSON.stringify({ docs: [] }), { status: 200 });
      return new Response(JSON.stringify({ doc: { id: 42 } }), { status: 201 });
    }) as typeof fetch;

    const result = await stageDraft(
      { slug: 's', title: 'T', surface: 'blog', content: { root: { type: 'root', children: [] } } },
      { baseUrl: 'https://cms.example', apiKey: 'KEY', fetchImpl },
    );

    expect(result).toMatchObject({ id: 42, operation: 'created' });
    const create = calls[1];
    expect(create.url).toBe('https://cms.example/api/posts?draft=true');
    expect((create.init!.headers as Record<string, string>).Authorization).toBe('users API-Key KEY');
    const body = JSON.parse(create.init!.body as string);
    expect(body._status).toBe('draft');
  });

  it('is idempotent on slug: an existing draft is PATCHed without title/slug', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes('where[slug]')) return new Response(JSON.stringify({ docs: [{ id: 7 }] }), { status: 200 });
      return new Response(JSON.stringify({ doc: { id: 7 } }), { status: 200 });
    }) as typeof fetch;

    const result = await stageDraft(
      { slug: 'roast', title: 'T', surface: 'recipes', collection: 'recipes', content: { root: { type: 'root', children: [] } } },
      { baseUrl: 'https://cms.example', apiKey: 'KEY', fetchImpl },
    );

    expect(result.operation).toBe('updated');
    const patch = calls[1];
    expect(patch.url).toBe('https://cms.example/api/recipes/7?draft=true');
    expect(patch.init!.method).toBe('PATCH');
    const body = JSON.parse(patch.init!.body as string);
    expect(body.title).toBeUndefined();
    expect(body.slug).toBeUndefined();
    expect(body._status).toBe('draft');
  });
});

describe('the pack collector', () => {
  it('sourceBudget is a hard stop, not a suggestion', () => {
    const collector = new PackCollector('s', 2);
    collector.add({ claim: 'a', source: 'https://x.org/1', excerpt: 'e', confidence: 'high', verifiedAt: '2026-07-01' });
    collector.add({ claim: 'b', source: 'https://x.org/2', excerpt: 'e', confidence: 'high', verifiedAt: '2026-07-01' });
    expect(() =>
      collector.add({ claim: 'c', source: 'https://x.org/3', excerpt: 'e', confidence: 'high', verifiedAt: '2026-07-01' }),
    ).toThrow(SourceBudgetExceededError);
  });

  it('couldNotVerify captures partial verifications rather than omitting them', () => {
    const collector = new PackCollector('s', 3);
    collector.recordPartial(
      'locality-level organic matter figures',
      { claim: 'state-level figures exist', source: 'https://x.org/state', excerpt: 'e', confidence: 'medium', verifiedAt: '2026-07-01' },
      'locality resolution not published',
    );
    const pack = collector.build();
    expect(pack.entries).toHaveLength(1);
    expect(pack.couldNotVerify).toHaveLength(1);
    expect(pack.couldNotVerify[0].note).toContain('partially verified');
  });

  it('build validates against pack.schema.json (couldNotVerify always present)', () => {
    const collector = new PackCollector('s', 1);
    collector.add({ claim: 'a sourced claim', source: 'https://x.org/1', excerpt: 'evidence', confidence: 'high', verifiedAt: '2026-07-01' });
    const pack = collector.build();
    expect(pack.couldNotVerify).toEqual([]);
  });
});

describe('the run report', () => {
  it('carries draft link, gate status and the full couldNotVerify list', async () => {
    const loop = {
      ok: true,
      attempts: 2,
      final: {
        slug: 's',
        ok: true,
        results: [{ gate: 'style-lint', status: 'pass' as const, failures: [] }],
        couldNotVerify: pack.couldNotVerify,
      },
      unsatisfied: [],
    };
    const report = renderRunReport({
      slug: 's',
      loop,
      staged: { id: 42, operation: 'created', url: 'https://cms.example/admin/collections/posts/42' },
      pack,
    });
    expect(report).toContain('https://cms.example/admin/collections/posts/42');
    expect(report).toContain('✅ style-lint');
    expect(report).toContain('couldNotVerify');
    expect(report).toContain('a locality figure');
  });

  it('an honest failure report names the unsatisfied gate', () => {
    const loop = {
      ok: false,
      attempts: 3,
      final: {
        slug: 's',
        ok: false,
        results: [{ gate: 'claim-coverage', status: 'fail' as const, failures: ['c9 resolves to no pack entry'] }],
        couldNotVerify: [],
      },
      unsatisfied: [{ gate: 'claim-coverage', failures: ['c9 resolves to no pack entry'] }],
    };
    const report = renderRunReport({ slug: 's', loop, pack: { ...pack, couldNotVerify: [] } });
    expect(report).toContain('Nothing staged');
    expect(report).toContain('claim-coverage');
    expect(report).toContain('c9');
  });
});

describe('edit distance and locus', () => {
  it('computes survival fraction and names the rewritten section', () => {
    const staged: DraftArtifact['content'] = {
      root: {
        type: 'root',
        children: [
          { type: 'heading', tag: 'h2', children: [{ type: 'text', text: 'Kept section' }] },
          { type: 'paragraph', children: [{ type: 'text', text: 'these words survive entirely intact today' }] },
          { type: 'heading', tag: 'h2', children: [{ type: 'text', text: 'Rewritten section' }] },
          { type: 'paragraph', children: [{ type: 'text', text: 'the original phrasing of this part' }] },
        ],
      },
    };
    const published: DraftArtifact['content'] = {
      root: {
        type: 'root',
        children: [
          { type: 'heading', tag: 'h2', children: [{ type: 'text', text: 'Kept section' }] },
          { type: 'paragraph', children: [{ type: 'text', text: 'these words survive entirely intact today' }] },
          { type: 'heading', tag: 'h2', children: [{ type: 'text', text: 'Rewritten section' }] },
          { type: 'paragraph', children: [{ type: 'text', text: 'a completely different set of sentences now' }] },
        ],
      },
    };
    const edit = computeEdit(staged, published);
    expect(edit.editDistance).toBeGreaterThan(0.4);
    expect(edit.editDistance).toBeLessThan(1);
    expect(edit.editLocus).toEqual(['Rewritten section']);
  });
});
