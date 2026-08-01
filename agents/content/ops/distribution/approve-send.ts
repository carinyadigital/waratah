/**
 * The human half of the send approval:
 *
 *   pnpm tsx agents/content/ops/distribution/approve-send.ts --adaptation <path.yaml> --by "Jonno"
 *
 * Approval binds to the adaptation's content hash — editing the adaptation
 * invalidates it. One approval, one send.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parse as parseYaml } from 'yaml';
import { approveSend } from '../../content-distributor/agent/sends';
import type { Adaptation } from '../../content-distributor/agent/adapt';
import { arg } from '@carinyaparc/content-pipeline';

const root = path.resolve(arg('root') ?? process.cwd());
const file = arg('adaptation');
const by = arg('by');
if (!file || !by) {
  console.error('usage: approve-send.ts --adaptation <path.yaml> --by "<your name>"');
  process.exit(1);
}

try {
  const adaptation = parseYaml(readFileSync(path.resolve(file), 'utf8')) as Adaptation;
  const approval = approveSend(root, adaptation, by);
  console.log(`approved: ${approval.sendId} by ${approval.approver} — this approval covers exactly this content, once`);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
