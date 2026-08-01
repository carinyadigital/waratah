/**
 * The analyst's run report — including the one-line metric that catches the
 * failure this agent most invites: the "recommend nothing" ratio. An analyst
 * that proposes work every period is justifying, not analysing.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { calibrationSummary } from './predictions';

interface ReadArtifact {
  period: string;
  findings: { finding: string; exploratory: boolean; confidence: string }[];
  couldNotDetermine: string[];
  recommendations: { action: string; target?: string | null; rationale: string }[];
}

export interface RecommendNothingRatio {
  periods: number;
  nothingPeriods: number;
  ratio: number | null;
}

export const recommendNothingRatio = (contentDir: string): RecommendNothingRatio => {
  const dir = path.join(contentDir, 'reads');
  if (!existsSync(dir)) return { periods: 0, nothingPeriods: 0, ratio: null };
  const reads = readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => parseYaml(readFileSync(path.join(dir, f), 'utf8')) as ReadArtifact);
  const nothing = reads.filter((r) => (r.recommendations ?? []).length === 0).length;
  return {
    periods: reads.length,
    nothingPeriods: nothing,
    ratio: reads.length ? Number((nothing / reads.length).toFixed(3)) : null,
  };
};

export const renderAnalystRunReport = (read: ReadArtifact, contentDir: string): string => {
  const lines: string[] = [];
  const ratio = recommendNothingRatio(contentDir);
  const calibration = calibrationSummary(contentDir);

  lines.push(`*read ${read.period}* — ${read.findings.length} finding(s), ${read.recommendations.length} recommendation(s)`);

  lines.push('', '*Findings*');
  for (const f of read.findings) {
    lines.push(`• ${f.exploratory ? '[exploratory] ' : ''}${f.finding} _(${f.confidence})_`);
  }

  if (read.couldNotDetermine.length) {
    lines.push('', '*Could not determine*');
    for (const c of read.couldNotDetermine) lines.push(`• ${c}`);
  }

  lines.push('', '*Recommendations*');
  if (!read.recommendations.length) {
    lines.push('• nothing this period — a valid and expected outcome');
  } else {
    for (const r of read.recommendations) lines.push(`• ${r.action}${r.target ? ` ${r.target}` : ''} — ${r.rationale}`);
  }

  lines.push(
    '',
    `*Recommend-nothing ratio:* ${ratio.nothingPeriods}/${ratio.periods} periods${ratio.ratio !== null ? ` (${(ratio.ratio * 100).toFixed(0)}%)` : ''} — if this stays at 0%, the analyst is justifying, not analysing`,
  );

  if (calibration.scored > 0) {
    lines.push(
      `*Calibration:* ${calibration.correct}/${calibration.scored} scored predictions correct; mean confidence ${(calibration.meanConfidence! * 100).toFixed(0)}%; gap ${calibration.calibrationGap}`,
    );
  }
  if (calibration.due > 0) {
    lines.push(`*Due for scoring:* ${calibration.due} prediction(s) past horizon — score them; a prediction unscored is a prediction wasted`);
  }

  return lines.join('\n');
};
