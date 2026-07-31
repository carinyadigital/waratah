/**
 * Per-surface adaptation — published work is adapted, not rewritten.
 *
 * The model drafts the adaptation at runtime; this module enforces what an
 * adaptation must be: within its surface's word band, linking back to the
 * canonical page, and — the check that earns its keep — making no claim
 * absent from the source document. Adaptation is where unsourced claims get
 * introduced: a shorter version for a different audience is exactly the
 * moment a hedge gets dropped. Adaptations may only narrow.
 */
import { createHash } from 'node:crypto';
import { collectClaims, textOf } from '../../../packages/content-pipeline/src/lexical/claim';
import type { ClaimPolicy, DraftArtifact, SurfaceSpec } from '../../../packages/content-pipeline/src/gates/types';

export interface Adaptation {
  slug: string;
  surface: string;
  title: string;
  /** Plain body for send surfaces (newsletter, linkedin, instagram). */
  body: string;
  canonicalUrl: string;
  /** Claims carried over from the source, by claimId, with the adapted phrasing. */
  claims: { claimId: string; text: string }[];
}

export interface AdaptationCheck {
  ok: boolean;
  failures: string[];
  contentHash: string;
}

export const adaptationHash = (adaptation: Adaptation): string =>
  createHash('sha256')
    .update(JSON.stringify([adaptation.slug, adaptation.surface, adaptation.title, adaptation.body, adaptation.claims]))
    .digest('hex');

export const checkAdaptation = (
  adaptation: Adaptation,
  source: DraftArtifact,
  surface: SurfaceSpec,
  policy: ClaimPolicy,
): AdaptationCheck => {
  const failures: string[] = [];

  // The adaptation belongs to its source and links back to it.
  if (adaptation.slug !== source.slug) failures.push(`adaptation slug "${adaptation.slug}" does not match source "${source.slug}"`);
  const canonicalPattern = new RegExp(`/${source.slug}/?$`);
  if (!canonicalPattern.test(adaptation.canonicalUrl)) {
    failures.push(`canonicalUrl "${adaptation.canonicalUrl}" does not link back to the canonical page /${source.slug}`);
  }
  if (!adaptation.body.includes(adaptation.canonicalUrl)) {
    failures.push('the body never links back to the canonical page');
  }

  // Surface conformance: the word band is the surface's, not the source's.
  const words = adaptation.body.split(/\s+/).filter(Boolean).length;
  if (words < surface.words.min) failures.push(`${words} words is under the ${surface.id} minimum of ${surface.words.min}`);
  if (words > surface.words.max) failures.push(`${words} words is over the ${surface.id} maximum of ${surface.words.max}`);

  // The claim-superset check: adaptations may only narrow.
  const sourceClaimIds = new Set(collectClaims(source.content).map((c) => c.claimId));
  for (const claim of adaptation.claims) {
    if (!sourceClaimIds.has(claim.claimId)) {
      failures.push(`claim ${claim.claimId} ("${claim.text}") does not exist in the source document — an adaptation may only narrow`);
    }
  }

  // No prohibited pattern anywhere; no regulated-category phrase outside the carried claims.
  const fullText = `${adaptation.title} ${adaptation.body}`;
  for (const p of policy.prohibited) {
    const m = fullText.match(new RegExp(p.pattern, 'i'));
    if (m) failures.push(`prohibited claim [${p.id}] matched "${m[0]}" — ${p.reason}`);
  }
  const carriedText = adaptation.claims.map((c) => c.text).join(' ');
  let outside = fullText;
  for (const c of adaptation.claims) outside = outside.replace(c.text, ' ');
  for (const category of policy.categories) {
    for (const pattern of category.patterns) {
      const re = new RegExp(pattern, 'i');
      if (re.test(outside) && !re.test(carriedText)) {
        failures.push(`unannotated ${category.id} phrase in the adaptation matches /${pattern}/ — carry the source claim or cut the sentence`);
      } else if (re.test(outside)) {
        failures.push(`${category.id} phrase appears outside the carried claim spans — keep regulated phrasing inside claims`);
      }
    }
  }

  // Source text sanity: an adaptation of an empty document is a new piece in disguise.
  if (!textOf(source.content.root).trim()) failures.push('source document is empty — nothing to adapt');

  return { ok: failures.length === 0, failures, contentHash: adaptationHash(adaptation) };
};
