/**
 *   agent validate                          definitions parse and conform
 *   agent build [--provider claude]         render into agents/<name>/dist/<provider>/
 *   agent build --check                     rebuild and fail if dist/ is stale
 *   agent deploy --provider claude [--dry-run]
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { DefinitionError, flatten, loadAll, type AgentDefinition } from './load';
import { getProvider, providerIds, UnsupportedFeatureError } from './providers/index';
import { publish, PublishError, requireApiKey } from './publish/claude';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (name: string) => process.argv.includes(`--${name}`);

const root = arg('root') ?? process.cwd();
const selected = () => (arg('provider') ? [arg('provider') as string] : providerIds);
const distDir = (agent: AgentDefinition, providerId: string) => path.join(agent.dir, 'dist', providerId);

const serialise = (content: unknown) => `${JSON.stringify(content, null, 2)}\n`;

// Subagents render into their own dist/<provider>/ alongside their
// coordinator's, one call per node — depth is capped at one by loadAgent, so
// this never recurses more than twice.
const buildAgent = (agent: AgentDefinition, write: boolean, changed: string[]): number => {
  let count = 0;

  for (const providerId of selected()) {
    // An agent's providers: block is also which providers it targets, not
    // only per-provider settings. A coordinator that never lists cursor is
    // making a deliberate exclusion (cursor cannot express a roster) — skip
    // cleanly rather than call render() and fail loudly for a combination
    // nobody asked for. A provider that IS declared still goes through
    // assertSupported and fails loudly on a genuine mismatch.
    if (agent.providers && !(providerId in agent.providers)) continue;

    const provider = getProvider(providerId);
    const files = provider.render(agent);
    const dir = distDir(agent, providerId);

    if (write) {
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
    }

    for (const { file, content } of files) {
      const target = path.join(dir, file);
      const next = serialise(content);
      const previous = existsSync(target) ? readFileSync(target, 'utf8') : null;
      if (previous !== next) changed.push(path.relative(root, target));
      if (write) {
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, next);
      }
      count += 1;
    }
    if (write) {
      console.log(`  ${agent.name} -> ${providerId} (${provider.models[agent.model]}) ${files.length} file(s)`);
    }
  }

  for (const sub of agent.subagents) {
    count += buildAgent(sub, write, changed);
  }

  return count;
};

const build = (write: boolean): { changed: string[]; count: number } => {
  const changed: string[] = [];
  let count = 0;
  for (const agent of loadAll(root)) {
    count += buildAgent(agent, write, changed);
  }
  return { changed, count };
};

const commands: Record<string, () => number | Promise<number>> = {
  validate: () => {
    const agents = loadAll(root);
    if (!agents.length) {
      console.error('no agents found under agents/');
      return 1;
    }

    let total = 0;
    const print = (a: AgentDefinition, indent: string) => {
      total += 1;
      const roster = a.multiagent ? ` roster=${a.multiagent.agents.map((r) => r.name).join(',')}` : '';
      console.log(
        `${indent}${a.name.padEnd(18 - indent.length)} model=${a.model.padEnd(8)} connectors=${a.connectors.length} schedules=${a.schedules.length}${roster}`,
      );
      for (const sub of a.subagents) print(sub, `${indent}  └─ `);
    };
    for (const a of agents) print(a, '  ');

    console.log(`validate: ${total} agent(s) conform`);
    return 0;
  },

  build: () => {
    if (flag('check')) {
      const { changed } = build(false);
      if (changed.length) {
        console.error('build --check: dist/ is stale. Run `pnpm build` and commit the result.');
        for (const f of changed) console.error(`  ${f}`);
        return 1;
      }
      console.log('build --check: dist/ is current');
      return 0;
    }
    const { count } = build(true);
    console.log(`build: ${count} file(s)`);
    return 0;
  },

  deploy: () => {
    const providerId = arg('provider');
    if (!providerId) {
      console.error(`deploy requires --provider <${providerIds.join('|')}>`);
      return 2;
    }
    if (providerId !== 'claude') {
      console.error(`deploy: no publisher wired for "${providerId}". Only claude is a deploy target.`);
      return 1;
    }

    const stale = build(false).changed;
    if (stale.length) {
      console.error('deploy: dist/ is stale, refusing. Run `pnpm build` and commit first.');
      for (const f of stale) console.error(`  ${f}`);
      return 1;
    }

    const dryRun = flag('dry-run');

    // Subagents first, then the coordinator that names them. Reads the
    // committed artifact rather than re-rendering, so what ships is byte for
    // byte what was reviewed.
    const ordered = flatten(loadAll(root))
      .filter((agent) => !agent.providers || providerId in agent.providers)
      .map((agent) => {
        const dir = distDir(agent, providerId);
        const read = (file: string) => JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as unknown;
        return {
          agent,
          definition: read('agent.json'),
          deployments: agent.schedules.map((s) => ({
            name: s.name,
            content: read(path.join('deployments', `${s.name}.json`)),
          })),
        };
      });

    if (!ordered.length) {
      console.error(`deploy: nothing targets "${providerId}".`);
      return 1;
    }

    const apiKey = dryRun ? 'dry-run' : requireApiKey();

    return publish(ordered, { apiKey, dryRun }).then(() => {
      console.log(dryRun ? 'deploy --dry-run: nothing was changed' : 'deploy: done');
      return 0;
    });
  },
};

const command = process.argv[2] ?? 'validate';
const run = commands[command];
if (!run) {
  console.error(`unknown command "${command}". try: ${Object.keys(commands).join(' | ')}`);
  process.exit(2);
}

try {
  // deploy is async; the rest are not. Awaiting both keeps one exit path.
  process.exit(await run());
} catch (error) {
  if (
    error instanceof DefinitionError ||
    error instanceof UnsupportedFeatureError ||
    error instanceof PublishError
  ) {
    console.error(`\n${error.message}\n`);
    process.exit(1);
  }
  throw error;
}
