/**
 * The register CLI:
 *
 *   pnpm agents list [--tag content] [--only name]
 *   pnpm agents check            # policy rules. The CI gate.
 *   pnpm agents matrix           # deploy matrix for GitHub Actions
 *   pnpm agents deploy --only name
 */
import process from 'node:process';
import { loadConnections, loadManifests } from '../../packages/agent-manifest/src/index';
import { arg } from '../../packages/content-pipeline/src/cliArgs';
import { coreRules, type RuleContext, type Violation } from './rules';
import { extraRules } from './rules-extra';

const root = arg('root') ?? process.cwd();
const command = process.argv[2] ?? 'check';

const ctx = (): RuleContext => ({
  root,
  manifests: loadManifests(root),
  connections: loadConnections(root),
});

const primaryBinding = (m: { bindings?: { provider: string; mode?: string; workflow?: string }[] }) =>
  m.bindings?.[0];

const filterManifests = (c: RuleContext) => {
  const tag = arg('tag');
  const only = arg('only');
  return c.manifests.filter(
    (m) =>
      (!tag || (m.manifest?.tags ?? []).includes(tag) || m.manifest?.team === tag) &&
      (!only || m.dir === only || m.manifest?.name === only),
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
      const binding = primaryBinding(manifest);
      const platform = binding ? `${binding.provider}:${binding.mode ?? ''}` : '?';
      console.log(
        `${dir.padEnd(22)} ${platform.padEnd(22)} approval=${manifest.policy.approval.padEnd(11)} writes=[${manifest.policy.writes.join(', ')}]`,
      );
    }
    return 0;
  },

  check: () => {
    const c = ctx();
    const violations: Violation[] = [...coreRules, ...extraRules].flatMap((rule) => rule(c));
    if (!violations.length) {
      console.log(`agents check: ${c.manifests.length} manifest(s), R1–R13 clean`);
      return 0;
    }
    for (const v of violations) console.error(`  ${v.rule.padEnd(4)} ${v.agent.padEnd(20)} ${v.message}`);
    console.error(`\nagents check: ${violations.length} violation(s)`);
    return 1;
  },

  matrix: () => {
    const c = ctx();
    const include = filterManifests(c)
      .filter((m) => {
        const b = primaryBinding(m.manifest ?? {});
        return b && !(b.provider === 'claude' && b.mode === 'subagent');
      })
      .map((m) => {
        const b = primaryBinding(m.manifest!)!;
        return { agent: m.manifest!.name, provider: b.provider, mode: b.mode };
      });
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
    const m = c.manifests.find((x) => x.dir === only || x.manifest?.name === only);
    if (!m?.manifest) {
      console.error(`no manifest for "${only}"`);
      return 1;
    }
    const binding = primaryBinding(m.manifest);
    if (!binding) {
      console.error(`${only}: no bindings`);
      return 1;
    }
    switch (binding.provider) {
      case 'github-actions':
        console.log(
          `${only}: github-actions agents deploy by merging their workflow (${binding.workflow}). Nothing to push.`,
        );
        return 0;
      case 'claude':
        if (binding.mode === 'subagent') {
          console.error(`${only}: claude subagent has no deploy path (interactive).`);
          return 1;
        }
        console.log(
          `${only}: claude managed deploy is driven by .github/workflows/agents-deploy.yml using the provider CLI. Manifest bindings are the source of truth.`,
        );
        return 0;
      case 'cursor-cloud':
        console.log(`${only}: cursor-cloud deploy is driven by the Cursor Cloud Agents API.`);
        return 0;
      default:
        console.error(`${only}: provider ${binding.provider} has no deploy path.`);
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
