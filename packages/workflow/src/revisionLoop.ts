/**
 * Bounded revision loop: run a check, revise on failure, stop at the budget.
 * Never reports success while the check fails; names what remains unsatisfied.
 */
import type { GateResult, SuiteResult } from './gates';

export interface RevisionLoopReport {
  ok: boolean;
  attempts: number;
  final: SuiteResult;
  unsatisfied: { gate: string; failures: string[] }[];
}

export const revisionLoop = async <T>(options: {
  initial: T;
  run: (current: T) => Promise<SuiteResult>;
  revise: (current: T, failing: SuiteResult) => Promise<T> | T;
  maxAttempts?: number;
}): Promise<{ report: RevisionLoopReport; value: T }> => {
  const maxAttempts = options.maxAttempts ?? 3;
  if (maxAttempts < 1) throw new Error('maxAttempts must be at least 1');

  let value = options.initial;
  let suite = await options.run(value);
  let attempts = 1;

  while (!suite.ok && attempts < maxAttempts) {
    value = await options.revise(value, suite);
    suite = await options.run(value);
    attempts += 1;
  }

  return {
    value,
    report: {
      ok: suite.ok,
      attempts,
      final: suite,
      unsatisfied: suite.results
        .filter((r: GateResult) => r.status === 'fail')
        .map((r) => ({ gate: r.gate, failures: r.failures })),
    },
  };
};
