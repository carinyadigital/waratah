/**
 * Pass 5, the gate loop. Bounded retry, honest failure report.
 * The reviser is the model at runtime and a stub in tests; the loop's
 * guarantees are mechanical either way: it never exceeds the budget, never
 * reports success while a gate fails, and names the unsatisfied gates when
 * it stops.
 */
import { runGates, type GateInput, type DraftArtifact } from '@carinyaparc/content-pipeline';
import { revisionLoop, type RevisionLoopReport, type SuiteResult } from '@carinyaparc/workflow';

export type GateLoopReport = RevisionLoopReport;

export type Reviser = (draft: DraftArtifact, failing: SuiteResult) => Promise<DraftArtifact> | DraftArtifact;

export const gateLoop = async (
  input: GateInput,
  revise: Reviser,
  maxAttempts = 3,
): Promise<GateLoopReport> => {
  const { report } = await revisionLoop({
    initial: input.draft,
    maxAttempts,
    run: async (draft) => {
      const suite = await runGates({ ...input, draft });
      return { slug: suite.slug, ok: suite.ok, results: suite.results };
    },
    revise,
  });
  return report;
};
