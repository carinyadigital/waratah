/** Provider-neutral gate result shapes and a suite runner. */

export type GateStatus = 'pass' | 'fail' | 'skip';

export interface GateResult {
  gate: string;
  status: GateStatus;
  failures: string[];
  notes?: string[];
}

export type GateFn<I> = (input: I) => Promise<GateResult> | GateResult;

export interface SuiteResult {
  slug: string;
  ok: boolean;
  results: GateResult[];
  /** Opaque extras the suite may attach (e.g. couldNotVerify). */
  meta?: Record<string, unknown>;
}

export const runGateSuite = async <I extends { slug: string }>(
  input: I,
  gates: GateFn<I>[],
  options?: { nameOf?: (gate: GateFn<I>) => string },
): Promise<SuiteResult> => {
  const results: GateResult[] = [];
  for (const gate of gates) {
    try {
      results.push(await gate(input));
    } catch (err) {
      results.push({
        gate: options?.nameOf?.(gate) ?? gate.name ?? 'unknown',
        status: 'fail',
        failures: [`gate crashed: ${(err as Error).message}`],
      });
    }
  }
  return {
    slug: input.slug,
    ok: results.every((r) => r.status !== 'fail'),
    results,
  };
};
