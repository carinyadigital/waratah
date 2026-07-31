/**
 * Brief conformance. The slug has a brief, the brief is schema-valid, the
 * trackerRef is well-formed, positioningHash is recorded, and the draft is
 * the piece the brief commissioned.
 */
import { validateArtifact } from '../validate';
import type { Gate, GateResult } from './types';

export const briefConformance: Gate = ({ slug, draft, brief, pack }): GateResult => {
  const failures: string[] = [];

  const schema = validateArtifact('brief', brief);
  if (!schema.valid) failures.push(...schema.errors.map((e) => `brief schema: ${e}`));

  if (brief.slug !== slug) failures.push(`brief slug "${brief.slug}" does not match "${slug}"`);
  if (draft.slug !== slug) failures.push(`draft slug "${draft.slug}" does not match "${slug}"`);
  if (pack.slug !== slug) failures.push(`pack slug "${pack.slug}" does not match "${slug}"`);
  if (draft.surface !== brief.surface)
    failures.push(`draft surface "${draft.surface}" does not match brief surface "${brief.surface}"`);

  if (!/^(CON-[0-9]+|triage\/[a-z0-9-]+)$/i.test(brief.trackerRef))
    failures.push(`trackerRef "${brief.trackerRef}" is neither a Linear ref (CON-n) nor a triage ref (triage/<id>)`);

  if (!/^[a-f0-9]{64}$/.test(brief.positioningHash)) failures.push('positioningHash is not recorded as a sha256 hex');

  if (pack.entries.length > brief.sourceBudget)
    failures.push(`pack has ${pack.entries.length} entries, over the brief's sourceBudget of ${brief.sourceBudget}`);

  return { gate: 'brief-conformance', status: failures.length ? 'fail' : 'pass', failures };
};
