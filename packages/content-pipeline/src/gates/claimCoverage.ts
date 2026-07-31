/**
 * The gate that matters. Pure structural work over serialized editor JSON:
 * no model calls, both directions checked.
 *
 *  1. Every annotated claim resolves to a pack entry.
 *  2. Every pack entry flagged mustSupport appears in the document.
 *  3. Every brief.mustSupport claim has a mustSupport pack entry backing it.
 *
 * Checks completeness, not truth: it catches a claim with no source, never a
 * claim with a bad one.
 */
import { collectClaims } from '../lexical/claim';
import type { Gate, GateResult } from './types';

export const claimCoverage: Gate = ({ draft, brief, pack }): GateResult => {
  const failures: string[] = [];
  const claims = collectClaims(draft.content);
  const entriesById = new Map(pack.entries.map((e) => [e.id, e]));

  // Direction one: document → pack
  for (const c of claims) {
    if (!entriesById.has(c.claimId)) {
      failures.push(`claim "${c.text}" (${c.claimId} at ${c.path}) resolves to no pack entry`);
    }
  }

  // Duplicate annotation ids are fine; unknown ids are not. Also catch empty annotations.
  for (const c of claims) {
    if (!c.text.trim()) failures.push(`claim ${c.claimId} at ${c.path} annotates no text`);
  }

  // Direction two: pack (mustSupport) → document
  const usedIds = new Set(claims.map((c) => c.claimId));
  for (const entry of pack.entries) {
    if (entry.mustSupport && !usedIds.has(entry.id)) {
      failures.push(`mustSupport pack entry ${entry.id} ("${entry.claim}") does not appear in the document`);
    }
  }

  // Brief → pack: every commissioned mustSupport claim is backed by a mustSupport entry
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const packMustSupport = new Set(pack.entries.filter((e) => e.mustSupport).map((e) => norm(e.claim)));
  for (const ms of brief.mustSupport) {
    if (!packMustSupport.has(norm(ms.claim))) {
      failures.push(`brief mustSupport "${ms.claim}" has no mustSupport pack entry`);
    }
  }

  return { gate: 'claim-coverage', status: failures.length ? 'fail' : 'pass', failures };
};
