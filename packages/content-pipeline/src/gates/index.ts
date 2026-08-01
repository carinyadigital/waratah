/**
 * The gate suite. Deterministic, no model calls. Grows monotonically from
 * human catches — every time the editor catches something, ask whether it
 * could have been a check.
 *
 * Content-specific gates stay here; the suite runner lives in @carinyaparc/workflow.
 */
import { runGateSuite, type SuiteResult as WorkflowSuite } from '@carinyaparc/workflow';
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

const gateNames = new Map<Gate, string>([
  [structure, 'structure'],
  [claimCoverage, 'claim-coverage'],
  [prohibition, 'prohibition'],
  [styleLint, 'style-lint'],
  [links, 'links'],
  [readability, 'readability'],
  [briefConformance, 'brief-conformance'],
]);

export interface SuiteResult {
  slug: string;
  ok: boolean;
  results: GateResult[];
  couldNotVerify: { claim: string; note: string }[];
}

export const runGates = async (input: GateInput): Promise<SuiteResult> => {
  const suite: WorkflowSuite = await runGateSuite(input, gates, {
    nameOf: (gate) => gateNames.get(gate) ?? gate.name ?? 'unknown',
  });
  return {
    ...suite,
    couldNotVerify: input.pack.couldNotVerify ?? [],
  };
};

export * from './types';
