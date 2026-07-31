/**
 * The horizon scoring job. Runs weekly with the monitor:
 *
 *   pnpm tsx scripts/predictions/score-horizon.ts                # mark due + report
 *   pnpm tsx scripts/predictions/score-horizon.ts \
 *     --id 2026-W31-r1 --outcome correct --note "re-ran the query: +41 subscribers vs baseline 12"
 *
 * At horizon the prediction is scored regardless of whether anyone asked.
 * Marking due is automatic; recording the outcome cites the re-run of the
 * prediction's own query.
 */
import path from 'node:path';
import process from 'node:process';
import { calibrationSummary, markDue, scorePrediction } from '../../agents/content-analyst/agent/predictions';
import { arg } from '../../packages/content-pipeline/src/cliArgs';

const root = path.resolve(arg('root') ?? process.cwd());
const contentDir = path.join(root, '.agency', 'content');

const id = arg('id');
if (id) {
  const outcome = arg('outcome') as 'correct' | 'wrong' | 'indeterminate' | undefined;
  const note = arg('note');
  if (!outcome || !note) {
    console.error('scoring requires --outcome correct|wrong|indeterminate and --note "<what the re-run showed>"');
    process.exit(1);
  }
  const scored = scorePrediction(contentDir, id, outcome, note);
  console.log(`scored ${scored.id}: ${scored.outcome} — ${scored.outcomeNote}`);
} else {
  const due = markDue(contentDir);
  if (due.length) {
    console.log(`${due.length} prediction(s) reached horizon and are due for scoring:`);
    for (const d of due) console.log(`  ${d.id}: "${d.claim}" (horizon ${d.horizon}, confidence ${d.confidence})`);
  } else {
    console.log('no predictions reached horizon');
  }
}

const summary = calibrationSummary(contentDir);
console.log(
  `calibration: ${summary.correct}/${summary.scored} correct${summary.hitRate !== null ? ` (hit rate ${(summary.hitRate * 100).toFixed(0)}%, mean confidence ${(summary.meanConfidence! * 100).toFixed(0)}%, gap ${summary.calibrationGap})` : ''}; ${summary.open} open, ${summary.due} due`,
);
