/**
 * The prohibition gate.
 *
 *  - Absolute prohibitions (claim-policy `prohibited` + the brief's
 *    mustNotClaim patterns) fail wherever they appear, annotated or not.
 *  - Claim-policy category patterns (source-required claims) fail when they
 *    appear OUTSIDE an annotated claim span — a regulated claim without an
 *    annotation is exactly the unsourced-claim failure with regulatory teeth.
 */
import { collectClaims, textOf, textOutsideClaims } from '../lexical/claim';
import type { Gate, GateResult } from './types';

const compile = (pattern: string): RegExp => new RegExp(pattern, 'i');

export const prohibition: Gate = ({ draft, brief, pack, brand }): GateResult => {
  const failures: string[] = [];
  const fullText = `${draft.title} ${textOf(draft.content.root)}`;
  const outsideClaims = `${draft.title} ${textOutsideClaims(draft.content)}`;

  for (const p of brand.claimPolicy.prohibited) {
    const re = compile(p.pattern);
    const m = fullText.match(re);
    if (m) failures.push(`prohibited claim [${p.id}] matched "${m[0]}" — ${p.reason}`);
  }

  for (const pattern of brief.mustNotClaim) {
    const re = compile(pattern);
    const m = fullText.match(re);
    if (m) failures.push(`brief mustNotClaim /${pattern}/ matched "${m[0]}"`);
  }

  for (const category of brand.claimPolicy.categories) {
    for (const pattern of category.patterns) {
      const re = compile(pattern);
      const m = outsideClaims.match(re);
      if (m) {
        failures.push(
          `unannotated ${category.id} claim: "${m[0]}" matches /${pattern}/ outside any claim annotation — annotate it and source it, or cut it`,
        );
      }
    }
  }

  // Annotated regulated claims must carry a source of adequate confidence: the
  // annotation exists, so check its pack entry is not a dangling low-confidence one.
  const entriesById = new Map(pack.entries.map((e) => [e.id, e]));
  for (const c of collectClaims(draft.content)) {
    const entry = entriesById.get(c.claimId);
    if (!entry) continue; // claim-coverage reports the missing entry
    for (const category of brand.claimPolicy.categories) {
      if (category.patterns.some((p) => compile(p).test(c.text)) && entry.confidence === 'low') {
        failures.push(
          `${category.id} claim "${c.text}" (${c.claimId}) rests on a low-confidence source — regulated categories need better`,
        );
      }
    }
  }

  return { gate: 'prohibition', status: failures.length ? 'fail' : 'pass', failures };
};
