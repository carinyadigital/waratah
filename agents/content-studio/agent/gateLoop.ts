/**
 * Pass 5, the gate loop. Bounded retry, honest failure report.
 * The reviser is the model at runtime and a stub in tests; the loop's
 * guarantees are mechanical either way: it never exceeds the budget, never
 * reports success while a gate fails, and names the unsatisfied gates when
 * it stops.
 */
import { runGates, type SuiteResult } from '../../../packages/content-pipeline/src/gates/index';
import type { GateInput, DraftArtifact } from '../../../packages/content-pipeline/src/gates/types';

export interface GateLoopReport {
  ok: boolean;
  attempts: number;
  final: SuiteResult;
  /** Gates still failing when the loop stopped, with their messages — the honest failure report. */
  unsatisfied: { gate: string; failures: string[] }[];
}

export type Reviser = (draft: DraftArtifact, failing: SuiteResult) => Promise<DraftArtifact> | DraftArtifact;

export const gateLoop = async (
  input: GateInput,
  revise: Reviser,
  maxAttempts = 3,
): Promise<GateLoopReport> => {
  if (maxAttempts < 1) throw new Error('maxAttempts must be at least 1');
  let draft = input.draft;
  let suite = await runGates({ ...input, draft });
  let attempts = 1;

  while (!suite.ok && attempts < maxAttempts) {
    draft = await revise(draft, suite);
    suite = await runGates({ ...input, draft });
    attempts += 1;
  }

  return {
    ok: suite.ok,
    attempts,
    final: suite,
    unsatisfied: suite.results
      .filter((r) => r.status === 'fail')
      .map((r) => ({ gate: r.gate, failures: r.failures })),
  };
};
