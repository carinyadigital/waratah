/**
 * The register CLI (architecture.md §7):
 *
 *   pnpm agents list [--tag content] [--only name]
 *   pnpm agents check            # policy rules. The CI gate.
 *   pnpm agents matrix           # deploy matrix for GitHub Actions
 *   pnpm agents deploy --only name
 *
 * `check` runs on every PR touching agents/** or config/connections.yaml.
 * It is the whole enforcement surface.
 */
import process from 'node:process';
import { loadConnections, loadManifests } from '../../packages/agent-manifest/src/index';
import { coreRules, type RuleContext, type Violation } from './rules';
import { extraRules } from './rules-extra';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const root = arg('root') ?? process.cwd();
const command = process.argv[2] ?? 'check';

const ctx = (): RuleContext => ({
  root,
  manifests: loadManifests(root),
  connections: loadConnections(root),
});

const filterManifests = (c: RuleContext) => {
  const tag = arg('tag');
  const only = arg('only');
  return c.manifests.filter(
    (m) => (!tag || (m.manifest?.tags ?? []).includes(tag)) && (!only || m.dir === only),
  );
};

const commands: Record<string, () => number> = {
  list: () => {
    const c = ctx();
    for (const { dir, manifest } of filterManifests(c)) {
      if (!manifest) {
        console.log(`${dir.padEnd(22)} (no manifest)`);
        continue;
      }
      console.log(
        `${dir.padEnd(22)} ${manifest.deploy.platform.padEnd(22)} approval=${manifest.policy.approval.padEnd(11)} writes=[${manifest.policy.writes.join(', ')}]`,
      );
    }
    return 0;
  },

  check: () => {
    const c = ctx();
    const violations: Violation[] = [...coreRules, ...extraRules].flatMap((rule) => rule(c));
    if (!violations.length) {
      console.log(`agents check: ${c.manifests.length} manifest(s), R1–R12 clean`);
      return 0;
    }
    for (const v of violations) console.error(`  ${v.rule.padEnd(4)} ${v.agent.padEnd(20)} ${v.message}`);
    console.error(`\nagents check: ${violations.length} violation(s)`);
    return 1;
  },

  matrix: () => {
    const c = ctx();
    const include = filterManifests(c)
      .filter((m) => m.manifest && m.manifest.deploy.platform !== 'claude-subagent')
      .map((m) => ({ agent: m.dir, platform: m.manifest.deploy.platform }));
    console.log(JSON.stringify({ include }));
    return 0;
  },

  deploy: () => {
    const only = arg('only');
    if (!only) {
      console.error('deploy requires --only <name>');
      return 1;
    }
    const c = ctx();
    const m = c.manifests.find((x) => x.dir === only);
    if (!m?.manifest) {
      console.error(`no manifest for "${only}"`);
      return 1;
    }
    // Dispatcher by platform. Provider credentials live in CI, not here.
    switch (m.manifest.deploy.platform) {
      case 'github-actions':
        console.log(`${only}: github-actions agents deploy by merging their workflow (${m.manifest.deploy.workflow}). Nothing to push.`);
        return 0;
      case 'claude-managed-agent':
        console.log(
          `${only}: claude-managed-agent deploy is driven by .github/workflows/agents-deploy.yml using the provider CLI with CLAUDE_MANAGED_AGENTS_TOKEN. Manifest is the source of truth; see docs/agent-deploys.md.`,
        );
        return 0;
      default:
        console.error(`${only}: platform ${m.manifest.deploy.platform} has no deploy path (legacy or interactive).`);
        return 1;
    }
  },
};

const run = commands[command];
if (!run) {
  console.error(`unknown command "${command}" — expected list | check | matrix | deploy`);
  process.exit(2);
}
process.exit(run());
