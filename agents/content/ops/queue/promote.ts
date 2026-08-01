/**
 * The human half of the promotion gate:
 *
 *   pnpm tsx agents/content/ops/queue/promote.ts --slug <slug> --by "Jonno"
 *   pnpm tsx agents/content/ops/queue/promote.ts --demote <slug> --by "Jonno"
 *
 * Agents file to Triage; promotion and demotion both refuse agent-shaped
 * names — a person decides what enters and leaves the queue.
 */
import path from 'node:path';
import process from 'node:process';
import { demote, promote } from '../../content-planner/agent/queue';
import { arg } from '@carinyaparc/content-pipeline';

const root = path.resolve(arg('root') ?? process.cwd());
const contentDir = path.join(root, 'agents', 'content', 'artifacts');

const toDemote = arg('demote');
const slug = arg('slug');
const by = arg('by');

if (!by || (!toDemote && !slug)) {
  console.error('usage: promote.ts --slug <slug> --by "<your name>" | --demote <slug> --by "<your name>"');
  process.exit(1);
}

try {
  if (toDemote) {
    const queue = demote(contentDir, toDemote, by);
    console.log(`demoted ${toDemote} (by ${by}) — queue: [${queue.ready.join(', ')}] (cap ${queue.cap})`);
  } else {
    const queue = promote(contentDir, slug!, by);
    console.log(`promoted ${slug} (by ${by}) — queue: [${queue.ready.join(', ')}] (cap ${queue.cap})`);
  }
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
