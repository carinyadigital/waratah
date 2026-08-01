/**
 * The threaded Slack run report. Whether the run completed or failed, the
 * thread carries the draft link, per-gate status and the full couldNotVerify
 * list. Formatting is mrkdwn; posting is the provider's chat write.
 */
import type { PackArtifact } from '@carinyaparc/content-pipeline';
import { renderGateTable, renderUnsatisfied } from '@carinyaparc/workflow';
import type { GateLoopReport } from './gateLoop';
import type { StageResult } from './stage';

export interface RunReportInput {
  slug: string;
  loop: GateLoopReport;
  staged?: StageResult;
  pack: PackArtifact;
}

export const renderRunReport = ({ slug, loop, staged, pack }: RunReportInput): string => {
  const lines: string[] = [];

  lines.push(
    loop.ok
      ? `*${slug}* — draft staged, all gates green in ${loop.attempts} attempt(s).`
      : `*${slug}* — stopped after ${loop.attempts} attempt(s); ${loop.unsatisfied.length} gate(s) unsatisfied. Nothing staged.`,
  );

  if (staged) lines.push(`Draft: ${staged.url} (${staged.operation})`);

  lines.push('', renderGateTable(loop.final.results));

  const unsat = renderUnsatisfied(loop);
  if (unsat) lines.push('', unsat);

  lines.push('', `*couldNotVerify* (${pack.couldNotVerify.length})`);
  if (pack.couldNotVerify.length === 0) {
    lines.push('• nothing — every claim searched for was sourced');
  } else {
    for (const c of pack.couldNotVerify) lines.push(`• ${c.claim} — _${c.note}_`);
  }

  return lines.join('\n');
};
