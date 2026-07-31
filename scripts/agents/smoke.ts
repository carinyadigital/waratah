/**
 * CNT04-02 (and CNT10-02 / CNT07-02) — local smoke run harness.
 *
 * `pnpm tsx scripts/agents/smoke.ts --agent content-studio --slug <slug>`
 *
 * Deploying to the managed-agent provider needs provider credentials and is
 * driven by .github/workflows/agents-deploy.yml. This harness is the local
 * half: manifest checked against the register rules, then a dry run of the
 * agent's deterministic spine against real artifacts — for content-studio
 * that is anchor → gates → report over a hand-written brief.
 */
import path from 'node:path';
import process from 'node:process';
import { loadManifests, loadConnections } from '../../packages/agent-manifest/src/index';
import { coreRules } from './rules';
import { extraRules } from './rules-extra';
import {
  corpusSlugs,
  loadBrand,
  loadBrief,
  loadDraft,
  loadPack,
  repoPaths,
} from '../../packages/content-pipeline/src/artifacts';
import { runGates } from '../../packages/content-pipeline/src/gates/index';
import { renderRunReport } from '../../agents/content-studio/agent/runReport';

const arg = (name: string, fallback?: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

const agent = arg('agent') ?? 'content-studio';
const root = path.resolve(arg('root', process.cwd())!);

const main = async () => {
  // 1. The manifest passes the register rules.
  const ctx = { root, manifests: loadManifests(root).filter((m) => m.dir === agent), connections: loadConnections(root) };
  if (!ctx.manifests.length || !ctx.manifests[0].manifest) throw new Error(`no manifest for ${agent}`);
  const violations = [...coreRules, ...extraRules].flatMap((r) => r(ctx));
  if (violations.length) {
    for (const v of violations) console.error(`  ${v.rule} ${v.message}`);
    throw new Error(`${agent}: manifest fails ${violations.length} rule(s)`);
  }
  console.log(`${agent}: manifest passes register rules`);

  // 2. Agent-specific dry run.
  if (agent === 'content-studio') {
    const slug = arg('slug', 'measuring-soil-carbon-baseline')!;
    const paths = repoPaths(root);
    const brand = loadBrand(paths);
    const suite = await runGates({
      slug,
      draft: loadDraft(paths, slug),
      brief: loadBrief(paths, slug),
      pack: loadPack(paths, slug),
      brand,
      options: { externalLinks: (arg('external-links', 'skip') as 'skip' | 'check'), corpusSlugs: corpusSlugs(paths) },
    });
    const report = renderRunReport({
      slug,
      loop: {
        ok: suite.ok,
        attempts: 1,
        final: suite,
        unsatisfied: suite.results.filter((r) => r.status === 'fail').map((r) => ({ gate: r.gate, failures: r.failures })),
      },
      pack: loadPack(paths, slug),
    });
    console.log('\n--- run report (as it would post to the Slack thread) ---\n');
    console.log(report);
    if (!suite.ok) process.exit(1);
  } else {
    console.log(`${agent}: no dry-run spine defined yet — manifest check only`);
  }
};

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
