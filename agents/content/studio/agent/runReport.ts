/**
 * The threaded Slack run report. Whether the run completed or failed, the
 * thread carries the draft link, per-gate status and the full couldNotVerify
 * list. Formatting is mrkdwn; posting is the provider's chat write
 * (policy.writes includes slack).
 */
import type { GateLoopReport } from './gateLoop';
import type { StageResult } from './stage';
import type { PackArtifact } from '@carinyaparc/content-pipeline';

const icon = { pass: '✅', fail: '❌', skip: '⏭️' } as const;

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

  lines.push('', '*Gates*');
  for (const r of loop.final.results) {
    lines.push(`${icon[r.status]} ${r.gate}`);
    if (r.status === 'fail') for (const f of r.failures) lines.push(`    • ${f}`);
  }

  if (!loop.ok) {
    lines.push('', '*What I could not satisfy*');
    for (const u of loop.unsatisfied) {
      lines.push(`• *${u.gate}*: ${u.failures.join('; ')}`);
    }
  }

  lines.push('', `*couldNotVerify* (${pack.couldNotVerify.length})`);
  if (pack.couldNotVerify.length === 0) {
    lines.push('• nothing — every claim searched for was sourced');
  } else {
    for (const c of pack.couldNotVerify) lines.push(`• ${c.claim} — _${c.note}_`);
  }

  return lines.join('\n');
};
