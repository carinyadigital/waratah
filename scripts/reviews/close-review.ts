/**
 * CNT04-09 — close the review record at publish.
 *
 * Usage:
 *   pnpm tsx scripts/reviews/close-review.ts --slug <slug> \
 *     --published-file <path to published doc JSON> \
 *     --human-score 4 --what-was-wrong "opening hedged; tightened it" \
 *     --gate-attempts 2
 *
 * The record cannot close without humanScore and whatWasWrong — the CLI
 * refuses, and the schema refuses again. Ten seconds of human time; every
 * piece published without it is a lost observation that cannot be backfilled.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parse as parseYaml, stringify as toYaml } from 'yaml';
import { computeEdit } from '../../packages/content-pipeline/src/review';
import { assertValid } from '../../packages/content-pipeline/src/validate';
import type { DraftArtifact } from '../../packages/content-pipeline/src/gates/types';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const fail = (msg: string): never => {
  console.error(`cannot close review: ${msg}`);
  process.exit(1);
};

const root = arg('root') ?? process.cwd();
const slug = arg('slug') ?? fail('--slug is required');
const publishedFile = arg('published-file') ?? fail('--published-file is required (the published document JSON)');
const humanScoreRaw = arg('human-score') ?? fail('--human-score is required — the record cannot close without it');
const whatWasWrong = arg('what-was-wrong') ?? fail('--what-was-wrong is required — "nothing" is a valid answer, silence is not');
const gateAttempts = Number(arg('gate-attempts') ?? 1);

const humanScore = Number(humanScoreRaw);
if (!Number.isInteger(humanScore) || humanScore < 1 || humanScore > 5) fail('--human-score must be an integer 1–5');
if (!whatWasWrong.trim()) fail('--what-was-wrong may not be blank');

const draftPath = path.join(root, '.agency/content/drafts', `${slug}.json`);
if (!existsSync(draftPath)) fail(`no staged draft at ${draftPath}`);
const staged = JSON.parse(readFileSync(draftPath, 'utf8')) as DraftArtifact;

const published = JSON.parse(readFileSync(path.resolve(publishedFile), 'utf8')) as DraftArtifact;

const brief = parseYaml(
  readFileSync(path.join(root, '.agency/content/briefs', `${slug}.yaml`), 'utf8'),
) as { positioningHash: string };

const edit = computeEdit(staged.content, published.content);

const record = {
  slug,
  editDistance: edit.editDistance,
  editLocus: edit.editLocus,
  humanScore,
  whatWasWrong,
  gateAttempts,
  publishedAt: new Date().toISOString(),
  positioningHash: brief.positioningHash,
};

assertValid('review', record, `review ${slug}`);

const dir = path.join(root, '.agency/content/reviews');
mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${slug}.yaml`);
writeFileSync(file, toYaml(record));

console.log(`review closed: ${file}`);
console.log(`  editDistance ${record.editDistance} — locus: ${record.editLocus.join(', ') || 'none'}`);
console.log(`  humanScore ${humanScore} — ${whatWasWrong}`);
