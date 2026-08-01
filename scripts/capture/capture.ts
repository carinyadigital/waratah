/**
 * Capture — an idea reaches Triage in one step.
 *
 * The Slack path: a capture trigger (emoji or shortcut) posts the message to
 * this repo as a repository_dispatch event (.github/workflows/content-capture.yml),
 * which runs this script and commits the Triage item. This CLI is also usable
 * directly:
 *
 *   pnpm tsx scripts/capture/capture.ts --author jonno --text "what about a piece on ..."
 *
 * Raw-text preservation is the contract: the item carries the idea verbatim.
 * No interpretation, no expansion, no prioritisation — a capture step that
 * rewrites the idea loses the thing that made it worth capturing, and there
 * is no way to recover the original.
 */
import { createHash } from 'node:crypto';
import process from 'node:process';
import { Triage, type TriageItem } from '../../agents/content/monitor/agent/triage';
import { arg } from '../../packages/content-pipeline/src/cliArgs';

export interface CaptureInput {
  text: string;
  author: string;
}

export interface CaptureResult {
  id: string;
  outcome: 'filed' | 'duplicate';
  item: Pick<TriageItem, 'id' | 'kind' | 'title' | 'raw' | 'author'>;
}

/** Mechanical truncation for the list view. Never a rewrite: the full text lives in `raw`. */
const mechanicalTitle = (text: string): string => {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length <= 80 ? oneLine : `${oneLine.slice(0, 77)}...`;
};

export const capture = (root: string, input: CaptureInput): CaptureResult => {
  if (!input.text.trim()) throw new Error('nothing to capture');
  if (!input.author.trim()) throw new Error('capture requires its author');

  // Idempotent on content+author: the same idea posted twice files once.
  const id = `idea-${createHash('sha256').update(`${input.author}\n${input.text}`).digest('hex').slice(0, 12)}`;

  const triage = new Triage(root);
  const outcome = triage.fileItem({
    id,
    kind: 'idea',
    title: mechanicalTitle(input.text),
    evidence: 'captured from Slack — raw text preserved below',
    author: input.author,
    raw: input.text, // verbatim. the whole point.
  });

  return { id, outcome, item: { id, kind: 'idea', title: mechanicalTitle(input.text), raw: input.text, author: input.author } };
};

if (process.argv[1]?.endsWith('capture.ts')) {
  const text = arg('text') ?? process.env.CAPTURE_TEXT;
  const author = arg('author') ?? process.env.CAPTURE_AUTHOR;
  if (!text || !author) {
    console.error('usage: capture.ts --author <who> --text "<the idea, verbatim>"');
    process.exit(1);
  }
  const result = capture(arg('root') ?? process.cwd(), { text, author });
  console.log(`${result.outcome}: ${result.id} — ${result.item.title}`);
}
