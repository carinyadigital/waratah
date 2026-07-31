/**
 * The human half of the promotion gate:
 *
 *   pnpm tsx scripts/queue/promote.ts --slug <slug> --by "Jonno"
 *   pnpm tsx scripts/queue/promote.ts --demote <slug>
 *
 * Agents file to Triage; this is the only writer of queue.yaml, and it
 * refuses agent-shaped names.
 */
import path from 'node:path';
import process from 'node:process';
import { demote, promote } from '../../agents/content-planner/agent/queue';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const root = path.resolve(arg('root') ?? process.cwd());
const contentDir = path.join(root, '.agency', 'content');

const toDemote = arg('demote');
if (toDemote) {
  const queue = demote(contentDir, toDemote);
  console.log(`demoted ${toDemote} — queue: [${queue.ready.join(', ')}] (cap ${queue.cap})`);
  process.exit(0);
}

const slug = arg('slug');
const by = arg('by');
if (!slug || !by) {
  console.error('usage: promote.ts --slug <slug> --by "<your name>" | --demote <slug>');
  process.exit(1);
}

try {
  const queue = promote(contentDir, slug, by);
  console.log(`promoted ${slug} (by ${by}) — queue: [${queue.ready.join(', ')}] (cap ${queue.cap})`);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
