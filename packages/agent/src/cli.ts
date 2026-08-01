/**
 *   agent validate                          definitions parse and conform
 *   agent build [--provider claude]         render into agents/<name>/dist/<provider>/
 *   agent build --check                     rebuild and fail if dist/ is stale
 *   agent deploy --provider claude [--dry-run]
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { DefinitionError, loadAll, type AgentDefinition } from './load';
import { getProvider, providerIds, UnsupportedFeatureError } from './providers/index';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (name: string) => process.argv.includes(`--${name}`);

const root = arg('root') ?? process.cwd();
const selected = () => (arg('provider') ? [arg('provider') as string] : providerIds);
const distDir = (agent: AgentDefinition, providerId: string) => path.join(agent.dir, 'dist', providerId);

const serialise = (content: unknown) => `${JSON.stringify(content, null, 2)}\n`;

const build = (write: boolean): { changed: string[]; count: number } => {
  const changed: string[] = [];
  let count = 0;

  for (const agent of loadAll(root)) {
    for (const providerId of selected()) {
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
  }
  return { changed, count };
};

const commands: Record<string, () => number> = {
  validate: () => {
    const agents = loadAll(root);
    if (!agents.length) {
      console.error('no agents found under agents/');
      return 1;
    }
    for (const a of agents) {
      console.log(
        `  ${a.name.padEnd(18)} model=${a.model.padEnd(8)} connectors=${a.connectors.length} schedules=${a.schedules.length}`,
      );
    }
    console.log(`validate: ${agents.length} agent(s) conform`);
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
    const stale = build(false).changed;
    if (stale.length) {
      console.error('deploy: dist/ is stale, refusing. Run `pnpm build` and commit first.');
      return 1;
    }
    for (const agent of loadAll(root)) {
      const dir = path.relative(root, distDir(agent, providerId));
      if (flag('dry-run')) {
        console.log(`  would deploy ${agent.name} from ${dir}`);
        continue;
      }
      console.error(`deploy: no publisher wired for "${providerId}" yet. Built artifact is at ${dir}.`);
      return 1;
    }
    return 0;
  },
};

const command = process.argv[2] ?? 'validate';
const run = commands[command];
if (!run) {
  console.error(`unknown command "${command}". try: ${Object.keys(commands).join(' | ')}`);
  process.exit(2);
}

try {
  process.exit(run());
} catch (error) {
  if (error instanceof DefinitionError || error instanceof UnsupportedFeatureError) {
    console.error(`\n${error.message}\n`);
    process.exit(1);
  }
  throw error;
}
