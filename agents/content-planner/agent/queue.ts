/**
 * The ready queue — capped, human-promoted (design.md §2.1; the epic's real
 * content). The cap is a policy field checked at write. Promotion into the
 * ready queue requires a human; the planner may file to Triage only, and no
 * agent may set priority.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml, stringify as toYaml } from 'yaml';

export interface ReadyQueue {
  cap: number;
  /** Ordered: position is priority, set only by the humans who promote. */
  ready: string[];
}

const queueFile = (contentDir: string) => path.join(contentDir, 'queue.yaml');

export const loadQueue = (contentDir: string): ReadyQueue => {
  const file = queueFile(contentDir);
  if (!existsSync(file)) return { cap: 3, ready: [] };
  return parseYaml(readFileSync(file, 'utf8')) as ReadyQueue;
};

export const queueHasRoom = (contentDir: string): boolean => {
  const queue = loadQueue(contentDir);
  return queue.ready.length < queue.cap;
};

/** Looks like an agent identity, not a person. The gate errs toward refusing. */
const agentLike = /^$|agent|bot|studio|planner|analyst|monitor|distributor|desk|-qa$|^ci$/i;

export class PromotionDeniedError extends Error {}

/**
 * The promotion gate. Only a named human promotes, and never past the cap.
 * There is deliberately no other writer of queue.yaml in the codebase.
 */
export const promote = (contentDir: string, slug: string, by: string): ReadyQueue => {
  if (agentLike.test(by.trim())) {
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

export const demote = (contentDir: string, slug: string): ReadyQueue => {
  const queue = loadQueue(contentDir);
  queue.ready = queue.ready.filter((s) => s !== slug);
  writeFileSync(queueFile(contentDir), toYaml(queue));
  return queue;
};
