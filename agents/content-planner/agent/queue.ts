/**
 * The ready queue — capped, human-promoted. The cap is a policy field checked
 * at write. Promotion into the ready queue requires a human; the planner may
 * file to Triage only, and no agent may set priority.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml, stringify as toYaml } from 'yaml';
import { looksLikeAgent } from '../../../packages/content-pipeline/src/humanApproval';

export interface ReadyQueue {
  cap: number;
  /** Ordered: position is priority, set only by the humans who promote. */
  ready: string[];
}

const queueFile = (contentDir: string) => path.join(contentDir, 'queue.yaml');

const DEFAULT_CAP = 3;

export const loadQueue = (contentDir: string): ReadyQueue => {
  const file = queueFile(contentDir);
  if (!existsSync(file)) return { cap: DEFAULT_CAP, ready: [] };
  const parsed = parseYaml(readFileSync(file, 'utf8')) as Partial<ReadyQueue>;
  const cap = typeof parsed.cap === 'number' && Number.isFinite(parsed.cap) && parsed.cap > 0 ? parsed.cap : DEFAULT_CAP;
  const ready = Array.isArray(parsed.ready) ? parsed.ready.filter((s): s is string => typeof s === 'string') : [];
  return { cap, ready };
};

export const queueHasRoom = (contentDir: string): boolean => {
  const queue = loadQueue(contentDir);
  return queue.ready.length < queue.cap;
};

export class PromotionDeniedError extends Error {}

/**
 * The promotion gate. Only a named human promotes, and never past the cap.
 */
export const promote = (contentDir: string, slug: string, by: string): ReadyQueue => {
  if (looksLikeAgent(by)) {
    throw new PromotionDeniedError(
      `promotion requires a named human (got "${by}") — the planner files to Triage; a person decides what enters the queue`,
    );
  }
  const queue = loadQueue(contentDir);
  if (queue.ready.includes(slug)) return queue;
  if (queue.ready.length >= queue.cap) {
    throw new PromotionDeniedError(
      `ready queue is at its cap of ${queue.cap} — finish or demote something before promoting "${slug}"`,
    );
  }
  const brief = path.join(contentDir, 'briefs', `${slug}.yaml`);
  if (!existsSync(brief)) throw new PromotionDeniedError(`no brief exists for "${slug}" — nothing to promote`);

  queue.ready.push(slug);
  writeFileSync(queueFile(contentDir), toYaml(queue));
  return queue;
};

const removeFromQueue = (contentDir: string, slug: string): ReadyQueue => {
  const queue = loadQueue(contentDir);
  queue.ready = queue.ready.filter((s) => s !== slug);
  writeFileSync(queueFile(contentDir), toYaml(queue));
  return queue;
};

/** The demotion gate. Only a named human demotes — same guard as promotion. */
export const demote = (contentDir: string, slug: string, by: string): ReadyQueue => {
  if (looksLikeAgent(by)) {
    throw new PromotionDeniedError(
      `demotion requires a named human (got "${by}") — a person decides what leaves the queue, same as what enters it`,
    );
  }
  return removeFromQueue(contentDir, slug);
};

/**
 * System cleanup only: drops a slug whose backing brief has expired. Not a
 * priority decision, so it carries no human-approver check — see `demote`
 * for that. Used by the weekly expiry sweep; other callers should use
 * `demote`.
 */
export const pruneExpiredFromQueue = (contentDir: string, slug: string): ReadyQueue => removeFromQueue(contentDir, slug);
