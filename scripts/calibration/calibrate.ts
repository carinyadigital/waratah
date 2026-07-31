/**
 * The calibration CLI.
 *
 *   # the agent records its shadow verdict, before the human decides
 *   pnpm tsx scripts/calibration/calibrate.ts shadow --class figure-rederivation --item 2026-W31-f0 --verdict reproduces
 *
 *   # the human records their decision, never having seen the shadow
 *   pnpm tsx scripts/calibration/calibrate.ts decide --class figure-rederivation --item 2026-W31-f0 --verdict reproduces [--severe-miss]
 *
 *   # query a class: level, sample size, last review date
 *   pnpm tsx scripts/calibration/calibrate.ts query --class figure-rederivation
 *
 *   # run the levels engine (weekly, with the monitor)
 *   pnpm tsx scripts/calibration/calibrate.ts levels
 */
import path from 'node:path';
import process from 'node:process';
import {
  agreementRate,
  queryClass,
  recordHumanDecision,
  recordShadowVerdict,
  runLevelsEngine,
} from '../../packages/content-pipeline/src/calibration';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

const root = path.resolve(arg('root') ?? process.cwd());
const command = process.argv[2];

try {
  switch (command) {
    case 'shadow': {
      recordShadowVerdict(root, arg('class')!, arg('item')!, arg('verdict')!);
      console.log('shadow verdict recorded. It will not be shown to the reviewer.');
      break;
    }
    case 'decide': {
      const observation = recordHumanDecision(root, arg('class')!, arg('item')!, arg('verdict')!, {
        severeMiss: flag('severe-miss'),
      });
      console.log(
        `paired: agent said "${observation.agentVerdict}", human said "${observation.humanVerdict}" — ${observation.agrees ? 'agree' : 'disagree'}${observation.severeMiss ? ' (SEVERE MISS — class demoted two levels)' : ''}`,
      );
      break;
    }
    case 'query': {
      const cls = queryClass(root, arg('class')!);
      const report = agreementRate(root, cls.id);
      console.log(
        `${cls.id}: level ${cls.level} (ceiling ${cls.ceiling}, ${cls.basis}) — sample ${cls.sampleSize}, agreement ${report.agreementRate ?? 'n/a'} over last ${report.observed}, last reviewed ${cls.lastReviewedAt ?? 'never'}`,
      );
      break;
    }
    case 'levels': {
      const changes = runLevelsEngine(root);
      if (!changes.length) console.log('levels engine: no class moved');
      for (const c of changes) console.log(`${c.kind}: ${c.classId} ${c.from} → ${c.to} (${c.reason})`);
      break;
    }
    default:
      console.error('usage: calibrate.ts shadow|decide|query|levels ...');
      process.exit(2);
  }
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
