/**
 * The gate suite. Deterministic, no model calls (design.md §5). Grows
 * monotonically from human catches — every time the editor catches something,
 * ask whether it could have been a check.
 */
import type { Gate, GateInput, GateResult } from './types';
import { briefConformance } from './briefConformance';
import { claimCoverage } from './claimCoverage';
import { links } from './links';
import { prohibition } from './prohibition';
import { readability } from './readability';
import { structure } from './structure';
import { styleLint } from './styleLint';

export const gates: Gate[] = [
  structure,
  claimCoverage,
  prohibition,
  styleLint,
  links,
  readability,
  briefConformance,
];

export interface SuiteResult {
  slug: string;
  ok: boolean;
  results: GateResult[];
  couldNotVerify: { claim: string; note: string }[];
}

export const runGates = async (input: GateInput): Promise<SuiteResult> => {
  const results: GateResult[] = [];
  for (const gate of gates) {
    try {
      results.push(await gate(input));
    } catch (err) {
      results.push({
        gate: gate.name || 'unknown',
        status: 'fail',
        failures: [`gate crashed: ${(err as Error).message}`],
      });
    }
  }
  return {
    slug: input.slug,
    ok: results.every((r) => r.status !== 'fail'),
    results,
    couldNotVerify: input.pack.couldNotVerify ?? [],
  };
};

export * from './types';
