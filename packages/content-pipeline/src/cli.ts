/**
 * Gate suite runner. `pnpm gates [--slug <slug>] [--external-links skip|check]
 * [--format table|markdown|json] [--out <file>]`
 *
 * Runs every gate for every brief that has a draft; briefs without drafts are
 * reported and skipped (they are queued work, not failures). Exit code is
 * non-zero when any gate fails — this is the CI contract (CNT03).
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  corpusSlugs,
  hasDraft,
  listBriefSlugs,
  loadBrand,
  loadBrief,
  loadDraft,
  loadPack,
  repoPaths,
} from './artifacts';
import { runGates, type SuiteResult } from './gates/index';
import { renderMarkdown, renderTable } from './report';

const arg = (name: string, fallback?: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

const main = async () => {
  const root = arg('root', process.cwd())!;
  const paths = repoPaths(path.resolve(root));
  const brand = loadBrand(paths);
  const only = arg('slug');
  const external = (arg('external-links', 'check') as 'check' | 'skip') ?? 'check';
  const format = arg('format', 'table');
  const out = arg('out');

  const slugs = only ? [only] : listBriefSlugs(paths);
  if (!slugs.length) {
    console.log('no briefs found under .agency/content/briefs');
    return;
  }

  const suites: SuiteResult[] = [];
  let failed = false;
  const skipped: string[] = [];

  for (const slug of slugs) {
    if (!hasDraft(paths, slug)) {
      skipped.push(slug);
      continue;
    }
    const suite = await runGates({
      slug,
      draft: loadDraft(paths, slug),
      brief: loadBrief(paths, slug),
      pack: loadPack(paths, slug),
      brand,
      options: { externalLinks: external, corpusSlugs: corpusSlugs(paths) },
    });
    suites.push(suite);
    if (!suite.ok) failed = true;
  }

  const rendered =
    format === 'json'
      ? JSON.stringify(suites, null, 2)
      : format === 'markdown'
        ? renderMarkdown(suites)
        : suites.map(renderTable).join('\n\n');

  if (out) writeFileSync(out, rendered);
  console.log(rendered);
  if (skipped.length) console.log(`\nbriefs without drafts (queued, not failing): ${skipped.join(', ')}`);

  if (failed) process.exit(1);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
