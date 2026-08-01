/** Shared mrkdwn fragments for run reports. */
import type { GateResult } from './gates';
import type { RevisionLoopReport } from './revisionLoop';

const icon = { pass: '✅', fail: '❌', skip: '⏭️' } as const;

export const renderGateTable = (results: GateResult[]): string => {
  const lines = ['*Gates*'];
  for (const r of results) {
    lines.push(`${icon[r.status]} ${r.gate}`);
    if (r.status === 'fail') for (const f of r.failures) lines.push(`    • ${f}`);
  }
  return lines.join('\n');
};

export const renderUnsatisfied = (report: RevisionLoopReport): string => {
  if (report.ok) return '';
  const lines = ['*What I could not satisfy*'];
  for (const u of report.unsatisfied) {
    lines.push(`• *${u.gate}*: ${u.failures.join('; ')}`);
  }
  return lines.join('\n');
};
