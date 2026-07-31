import { describe, expect, it } from 'vitest';
import {
  claimNode,
  doc,
  heading,
  link,
  paragraph,
  textNode,
} from '../src/lexical/claim';
import { runGates } from '../src/gates/index';
import { validateArtifact } from '../src/validate';
import type { BrandDist, BriefArtifact, DraftArtifact, GateInput, PackArtifact } from '../src/gates/types';

const brand: BrandDist = {
  positioning: { hash: 'a'.repeat(64) },
  claimPolicy: {
    prohibited: [
      { id: 'carbon-neutral', pattern: 'carbon[ -]?(neutral|negative)|net[ -]?zero', reason: 'no certified accounting' },
    ],
    categories: [
      { id: 'environmental-outcome', maxSourceAgeMonths: 12, patterns: ['soil (organic )?carbon'] },
      { id: 'nutrition', maxSourceAgeMonths: 24, patterns: ['nutrient[ -]dense'] },
    ],
  },
  bannedWords: {
    banned: [{ term: 'leverage', reason: 'corporate filler', instead: 'use' }],
    perSurface: { blog: [{ term: 'thrilled to announce', reason: 'filler' }] },
  },
  surfaces: {
    blog: {
      id: 'blog',
      readability: { minFlesch: 30, maxFlesch: 90 },
      words: { min: 5, max: 3000 },
      decayHalfLifeMonths: 18,
      requiresInternalLinks: true,
      canonical: true,
    },
  },
};

const brief: BriefArtifact = {
  slug: 'test-piece',
  trackerRef: 'CON-1',
  surface: 'blog',
  targetQuery: 'soil carbon measurement',
  angle: 'measurement first',
  audience: 'practitioners',
  mustSupport: [{ claim: 'Soil organic carbon rose 0.4% over four years' }],
  mustNotClaim: ['best farm in australia'],
  internalLinks: ['visit-the-farm'],
  sourceBudget: 5,
  successMetric: 'subscriber conversion by cluster',
  positioningHash: 'a'.repeat(64),
  expiresAt: '2026-10-29',
};

const pack: PackArtifact = {
  slug: 'test-piece',
  entries: [
    {
      id: 'c1',
      claim: 'Soil organic carbon rose 0.4% over four years',
      source: 'https://example.org/soil-study',
      excerpt: 'SOC rose from 2.1% to 2.5% between 2022 and 2026.',
      confidence: 'high',
      verifiedAt: '2026-07-01',
      mustSupport: true,
    },
  ],
  couldNotVerify: [],
};

const goodDraft = (): DraftArtifact => ({
  slug: 'test-piece',
  title: 'What four years of measuring taught us',
  surface: 'blog',
  content: doc(
    heading('h2', 'The numbers first'),
    paragraph(
      textNode('We measured. '),
      claimNode('c1', 'Soil organic carbon rose 0.4% over four years'),
      textNode(' across the north paddocks. Short sentences help everyone read this. Come and see it.'),
    ),
    paragraph(link('/visit-the-farm', 'Visit the farm'), textNode(' to walk the transects with us.')),
  ),
});

const input = (draft: DraftArtifact, over: Partial<GateInput> = {}): GateInput => ({
  slug: 'test-piece',
  draft,
  brief,
  pack,
  brand,
  options: { externalLinks: 'skip', corpusSlugs: ['visit-the-farm', 'test-piece'] },
  ...over,
});

describe('schemas (CNT02-S2)', () => {
  it('accepts a valid brief and rejects one missing required fields', () => {
    expect(validateArtifact('brief', brief).valid).toBe(true);
    const { positioningHash: _drop, ...rest } = brief;
    expect(validateArtifact('brief', rest).valid).toBe(false);
  });

  it('pack: couldNotVerify is required, not empty by omission', () => {
    expect(validateArtifact('pack', pack).valid).toBe(true);
    const { couldNotVerify: _drop, ...rest } = pack;
    expect(validateArtifact('pack', rest).valid).toBe(false);
  });

  it('read: pre-registered questions, alternativeExplanations and couldNotDetermine are required', () => {
    const read = {
      period: '2026-W31',
      positioningHash: 'a'.repeat(64),
      questions: ['Did recipe-page subscriber conversion change after the CTA move?'],
      findings: [
        {
          finding: 'Recipe cluster conversion held steady',
          figures: [{ value: 0.021, query: 'ga4: sessionConversionRate cluster=recipes', n: 812, window: '28d' }],
          cluster: 'topic-area',
          confidence: 'medium',
          exploratory: false,
          alternativeExplanations: ['Seasonal traffic mix shifted toward returning readers'],
        },
      ],
      couldNotDetermine: [],
      recommendations: [],
    };
    expect(validateArtifact('read', read).valid).toBe(true);

    const noAlt = structuredClone(read) as Record<string, unknown>;
    delete (noAlt.findings as Record<string, unknown>[])[0].alternativeExplanations;
    expect(validateArtifact('read', noAlt).valid).toBe(false);

    const noCnd = structuredClone(read) as Record<string, unknown>;
    delete noCnd.couldNotDetermine;
    expect(validateArtifact('read', noCnd).valid).toBe(false);
  });
});

describe('gate suite (CNT02-S3)', () => {
  it('a well-formed piece passes every gate', async () => {
    const suite = await runGates(input(goodDraft()));
    expect(suite.results.map((r) => `${r.gate}:${r.status}`)).toEqual([
      'structure:pass',
      'claim-coverage:pass',
      'prohibition:pass',
      'style-lint:pass',
      'links:pass',
      'readability:pass',
      'brief-conformance:pass',
    ]);
    expect(suite.ok).toBe(true);
  });

  it('claim coverage fails an annotation with no pack entry', async () => {
    const draft = goodDraft();
    draft.content.root.children!.push(paragraph(claimNode('c9', 'an unsourced number')));
    const suite = await runGates(input(draft));
    const cc = suite.results.find((r) => r.gate === 'claim-coverage')!;
    expect(cc.status).toBe('fail');
    expect(cc.failures.join(' ')).toContain('c9');
  });

  it('claim coverage fails when a mustSupport entry is absent from the document', async () => {
    const draft = goodDraft();
    // remove the paragraph containing the claim
    draft.content.root.children = draft.content.root.children!.filter((_, i) => i !== 1);
    const suite = await runGates(input(draft));
    const cc = suite.results.find((r) => r.gate === 'claim-coverage')!;
    expect(cc.status).toBe('fail');
    expect(cc.failures.join(' ')).toContain('mustSupport');
  });

  it('prohibition fails an absolute prohibited claim even when annotated', async () => {
    const draft = goodDraft();
    draft.content.root.children!.push(paragraph(claimNode('c1', 'we are carbon neutral')));
    const suite = await runGates(input(draft));
    const p = suite.results.find((r) => r.gate === 'prohibition')!;
    expect(p.status).toBe('fail');
    expect(p.failures.join(' ')).toContain('carbon-neutral');
  });

  it('prohibition fails a regulated-category phrase outside any annotation', async () => {
    const draft = goodDraft();
    draft.content.root.children!.push(paragraph(textNode('Our nutrient-dense beef speaks for itself.')));
    const suite = await runGates(input(draft));
    const p = suite.results.find((r) => r.gate === 'prohibition')!;
    expect(p.status).toBe('fail');
    expect(p.failures.join(' ')).toContain('nutrition');
  });

  it('the same regulated phrase inside an annotation with a source passes prohibition', async () => {
    const draft = goodDraft();
    const packWithNutrition: PackArtifact = {
      ...pack,
      entries: [
        ...pack.entries,
        {
          id: 'c2',
          claim: 'Grass-finished beef is nutrient-dense relative to grain-finished',
          source: 'https://example.org/nutrition-study',
          excerpt: 'Higher omega-3 and micronutrient density in grass-finished beef.',
          confidence: 'high',
          verifiedAt: '2026-06-01',
        },
      ],
    };
    draft.content.root.children!.push(paragraph(claimNode('c2', 'nutrient-dense relative to grain-finished beef')));
    const suite = await runGates(input(draft, { pack: packWithNutrition }));
    const p = suite.results.find((r) => r.gate === 'prohibition')!;
    expect(p.status).toBe('pass');
  });

  it('style lint catches banned terms and brief mustNotClaim patterns are enforced', async () => {
    const draft = goodDraft();
    draft.content.root.children!.push(
      paragraph(textNode('We leverage our paddocks as the best farm in Australia.')),
    );
    const suite = await runGates(input(draft));
    expect(suite.results.find((r) => r.gate === 'style-lint')!.status).toBe('fail');
    expect(suite.results.find((r) => r.gate === 'prohibition')!.failures.join(' ')).toContain('mustNotClaim');
  });

  it('links gate fails when a brief internal link is missing', async () => {
    const draft = goodDraft();
    draft.content.root.children = draft.content.root.children!.filter((_, i) => i !== 2);
    const suite = await runGates(input(draft));
    const l = suite.results.find((r) => r.gate === 'links')!;
    expect(l.status).toBe('fail');
    expect(l.failures.join(' ')).toContain('visit-the-farm');
  });

  it('structure gate rejects a claim node without a claimId', async () => {
    const draft = goodDraft();
    draft.content.root.children!.push({
      type: 'paragraph',
      children: [{ type: 'claim', children: [{ type: 'text', text: 'floating' }] } as never],
    });
    const suite = await runGates(input(draft));
    expect(suite.results.find((r) => r.gate === 'structure')!.status).toBe('fail');
  });

  it('the suite makes no model calls and no network calls when external links are skipped', async () => {
    // No fetch spy needed: options.externalLinks 'skip' short-circuits the only
    // network path. This test asserts the run completes with fetch disabled.
    const originalFetch = globalThis.fetch;
    // @ts-expect-error deliberate sabotage
    globalThis.fetch = () => {
      throw new Error('network call attempted');
    };
    try {
      const suite = await runGates(input(goodDraft()));
      expect(suite.ok).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
