/**
 * CNT02-09 (part) — structure. The staged document validates against the
 * draft artifact schema (which encodes the Payload document shape the studio
 * stages: slug, title, surface, and a well-formed Lexical tree whose claim
 * nodes carry claimIds). Word count against the surface spec lives here too —
 * it is a structural property of the surface.
 */
import { textOf } from '../lexical/claim';
import { validateArtifact } from '../validate';
import type { Gate, GateResult } from './types';

export const structure: Gate = ({ draft, brand }): GateResult => {
  const failures: string[] = [];

  const schema = validateArtifact('draft', draft);
  if (!schema.valid) failures.push(...schema.errors.map((e) => `schema: ${e}`));

  const surface = brand.surfaces[draft.surface];
  if (!surface) {
    failures.push(`unknown surface "${draft.surface}"`);
  } else {
    const words = textOf(draft.content.root).split(/\s+/).filter(Boolean).length;
    if (words < surface.words.min) failures.push(`${words} words is under the ${surface.id} minimum of ${surface.words.min}`);
    if (words > surface.words.max) failures.push(`${words} words is over the ${surface.id} maximum of ${surface.words.max}`);
  }

  return { gate: 'structure', status: failures.length ? 'fail' : 'pass', failures };
};
