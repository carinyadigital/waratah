/**
 * The invariants. Pure functions over plain inputs: the runner assembles the
 * corpus, these decide. No model calls.
 */
import { collectClaims, collectLinks, type LexicalDocument } from '../../../packages/content-pipeline/src/lexical/claim';
import { internalSlug } from '../../../packages/content-pipeline/src/gates/links';
import type { BriefArtifact, ClaimPolicy, PackArtifact, SurfaceSpec } from '../../../packages/content-pipeline/src/gates/types';

export interface CorpusDoc {
  slug: string;
  surface: string;
  content: LexicalDocument;
  publishedAt?: string;
  lastReviewedAt?: string;
  positioningHash?: string;
}

export interface Violation {
  invariant: string;
  page: string;
  title: string;
  evidence: string;
}

/** Every published document has a brief and a pack; orphans both directions. */
export const checkBriefAndPack = (
  published: CorpusDoc[],
  briefSlugs: string[],
  packSlugs: string[],
  knownDocSlugs: string[],
): Violation[] => {
  const violations: Violation[] = [];
  const briefs = new Set(briefSlugs);
  const packs = new Set(packSlugs);
  const docs = new Set(knownDocSlugs);

  for (const doc of published) {
    if (!briefs.has(doc.slug))
      violations.push({
        invariant: 'published-has-brief',
        page: doc.slug,
        title: `published page "${doc.slug}" has no brief`,
        evidence: `no .agency/content/briefs/${doc.slug}.yaml`,
      });
    if (!packs.has(doc.slug))
      violations.push({
        invariant: 'published-has-pack',
        page: doc.slug,
        title: `published page "${doc.slug}" has no pack`,
        evidence: `no .agency/content/packs/${doc.slug}.yaml`,
      });
  }

  for (const slug of briefSlugs) {
    if (!docs.has(slug))
      violations.push({
        invariant: 'brief-orphaned',
        page: slug,
        title: `brief "${slug}" has no document`,
        evidence: 'no staged draft or published page carries this slug — expired work or a slug drift',
      });
  }

  return violations;
};

/** Every published document has a review record — the invariant review.schema.json's own description asserts. */
export const checkPublishedHasReview = (published: CorpusDoc[], reviewSlugs: string[]): Violation[] => {
  const reviews = new Set(reviewSlugs);
  return published
    .filter((doc) => !reviews.has(doc.slug))
    .map((doc) => ({
      invariant: 'published-has-review',
      page: doc.slug,
      title: `published page "${doc.slug}" has no review record`,
      evidence: `no .agency/content/reviews/${doc.slug}.yaml — the calibration/shadow pipeline treats review records as its sole input`,
    }));
};

/** The cannibalisation check: every targetQuery maps to exactly one canonical page. */
export const checkTargetQueryUniqueness = (briefs: BriefArtifact[]): Violation[] => {
  const byQuery = new Map<string, string[]>();
  for (const brief of briefs) {
    const q = brief.targetQuery.trim().toLowerCase();
    byQuery.set(q, [...(byQuery.get(q) ?? []), brief.slug]);
  }
  return [...byQuery.entries()]
    .filter(([, slugs]) => slugs.length > 1)
    .map(([query, slugs]) => ({
      invariant: 'target-query-unique',
      page: slugs.sort().join('+'),
      title: `targetQuery "${query}" is claimed by ${slugs.length} briefs`,
      evidence: `briefs: ${slugs.join(', ')} — two pages targeting one query is a self-inflicted SEO wound`,
    }));
};

/** Every page has at least one internal link in. */
export const checkInternalLinkGraph = (corpus: CorpusDoc[]): Violation[] => {
  const inbound = new Map<string, number>(corpus.map((d) => [d.slug, 0]));
  for (const doc of corpus) {
    for (const link of collectLinks(doc.content)) {
      const slug = internalSlug(link.url);
      if (slug && slug !== doc.slug && inbound.has(slug)) inbound.set(slug, (inbound.get(slug) ?? 0) + 1);
    }
  }
  return corpus
    .filter((d) => (inbound.get(d.slug) ?? 0) === 0)
    .map((d) => ({
      invariant: 'internal-link-in',
      page: d.slug,
      title: `page "${d.slug}" has no internal links in`,
      evidence: 'unreachable from the rest of the corpus — orphaned in the site graph',
    }));
};

/** Every external link resolves. The fetch is injected; offline runs skip. */
export const checkExternalLinks = async (
  corpus: CorpusDoc[],
  packs: PackArtifact[],
  fetchImpl: typeof fetch,
): Promise<Violation[]> => {
  const urls = new Map<string, string[]>(); // url -> pages using it
  for (const doc of corpus) {
    for (const link of collectLinks(doc.content)) {
      if (/^https?:\/\//i.test(link.url)) urls.set(link.url, [...(urls.get(link.url) ?? []), doc.slug]);
    }
  }
  for (const pack of packs) {
    for (const entry of pack.entries) urls.set(entry.source, [...(urls.get(entry.source) ?? []), pack.slug]);
  }

  const violations: Violation[] = [];
  for (const [url, pages] of urls) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      let res = await fetchImpl(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
      if (res.status === 405 || res.status === 501) {
        res = await fetchImpl(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
      }
      clearTimeout(timer);
      if (res.status >= 400) {
        violations.push({
          invariant: 'external-link-resolves',
          page: pages[0],
          title: `external link returns ${res.status}`,
          evidence: `${url} (used by: ${[...new Set(pages)].join(', ')})`,
        });
      }
    } catch (err) {
      violations.push({
        invariant: 'external-link-resolves',
        page: pages[0],
        title: 'external link did not resolve',
        evidence: `${url} — ${(err as Error).message} (used by: ${[...new Set(pages)].join(', ')})`,
      });
    }
  }
  return violations;
};

/** Regulated claims' sources are within their category's age limit. */
export const checkSourceFreshness = (
  packs: PackArtifact[],
  policy: ClaimPolicy,
  now = new Date(),
): Violation[] => {
  const violations: Violation[] = [];
  for (const pack of packs) {
    for (const entry of pack.entries) {
      for (const category of policy.categories) {
        if (!category.patterns.some((p) => new RegExp(p, 'i').test(entry.claim))) continue;
        const ageMonths =
          (now.getTime() - new Date(entry.verifiedAt).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
        if (ageMonths > category.maxSourceAgeMonths) {
          violations.push({
            invariant: 'source-age',
            page: pack.slug,
            title: `${category.id} claim's source is ${Math.floor(ageMonths)} months old (limit ${category.maxSourceAgeMonths})`,
            evidence: `${entry.id}: "${entry.claim}" verified ${entry.verifiedAt} against ${entry.source}`,
          });
        }
        break; // first matching category governs
      }
    }
  }
  return violations;
};

/** No page predates the current positioning hash. */
export const checkPositioningHash = (corpus: CorpusDoc[], currentHash: string): Violation[] =>
  corpus
    .filter((d) => d.positioningHash && d.positioningHash !== currentHash)
    .map((d) => ({
      invariant: 'positioning-current',
      page: d.slug,
      title: `page "${d.slug}" predates the current positioning`,
      evidence: `written under ${d.positioningHash!.slice(0, 12)}…, current is ${currentHash.slice(0, 12)}… — re-review against positioning.md`,
    }));

/** No page unreviewed past its surface's decay half-life. */
export const checkDecay = (
  corpus: CorpusDoc[],
  surfaces: Record<string, SurfaceSpec>,
  now = new Date(),
): Violation[] => {
  const violations: Violation[] = [];
  for (const doc of corpus) {
    const surface = surfaces[doc.surface];
    if (!surface || !doc.publishedAt) continue;
    const reference = doc.lastReviewedAt ?? doc.publishedAt;
    const ageMonths = (now.getTime() - new Date(reference).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
    if (ageMonths > surface.decayHalfLifeMonths) {
      violations.push({
        invariant: 'decay-half-life',
        page: doc.slug,
        title: `page "${doc.slug}" unreviewed for ${Math.floor(ageMonths)} months (half-life ${surface.decayHalfLifeMonths})`,
        evidence: `last reviewed ${reference} — nobody ever re-verifies a two-year-old page unless something files the work`,
      });
    }
  }
  return violations;
};

/** Every mustSupport claim still resolves: pack ↔ annotation re-check on the live corpus. */
export const checkMustSupportStillResolves = (corpus: CorpusDoc[], packs: PackArtifact[]): Violation[] => {
  const violations: Violation[] = [];
  const packBySlug = new Map(packs.map((p) => [p.slug, p]));
  for (const doc of corpus) {
    const pack = packBySlug.get(doc.slug);
    if (!pack) continue;
    const annotated = new Set(collectClaims(doc.content).map((c) => c.claimId));
    for (const entry of pack.entries.filter((e) => e.mustSupport)) {
      if (!annotated.has(entry.id)) {
        violations.push({
          invariant: 'must-support-resolves',
          page: doc.slug,
          title: `mustSupport claim ${entry.id} no longer annotated in "${doc.slug}"`,
          evidence: `"${entry.claim}" — likely deleted during a human edit; restore the annotation or amend the pack`,
        });
      }
    }
  }
  return violations;
};
