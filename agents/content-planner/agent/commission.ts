/**
 * The commissioner — one opportunity becomes one brief.
 *
 * The brief validates against brief.schema.json, carries positioningHash and
 * expiresAt (90 days — an unstarted brief is a stale opinion), and its
 * targetQuery is collision-checked at write against every existing brief and
 * published page: the cannibalisation invariant applied earlier, at the
 * moment of creation rather than the weekly sweep.
 *
 * The brief always files to Triage. Whether it also enters the ready queue
 * is never this module's decision: promotion requires a human (queue.ts).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml, stringify as toYaml } from 'yaml';
import { assertValid } from '../../../packages/content-pipeline/src/validate';
import type { BriefArtifact } from '../../../packages/content-pipeline/src/gates/types';
import { Triage } from '../../content-monitor/agent/triage';
import { queueHasRoom } from './queue';

export interface CommissionInput {
  opportunity: {
    id: string;
    title: string;
    targetQuery: string;
    surface: 'blog' | 'recipes' | 'landing' | 'newsletter';
    bet: string;
    evidence: { artifact: string; ref: string }[];
  };
  angle: string;
  audience: string;
  mustSupport: { claim: string; evidence?: string }[];
  mustNotClaim: string[];
  internalLinks: string[];
  sourceBudget: number;
  successMetric: string;
  positioningHash: string;
}

export class TargetQueryCollisionError extends Error {
  constructor(query: string, holder: string) {
    super(`targetQuery "${query}" already belongs to "${holder}" — two pages targeting one query is the wound the invariant exists to prevent`);
  }
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

const existingTargetQueries = (contentDir: string): Map<string, string> => {
  const map = new Map<string, string>();
  const dir = path.join(contentDir, 'briefs');
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.yaml'))) {
      const brief = parseYaml(readFileSync(path.join(dir, f), 'utf8')) as BriefArtifact;
      if (brief?.targetQuery) map.set(brief.targetQuery.trim().toLowerCase(), brief.slug);
    }
  }
  return map;
};

export interface CommissionResult {
  slug: string;
  briefFile: string;
  filedTo: 'triage';
  queueHadRoom: boolean;
  trackerRef: string;
}

export const commission = (root: string, input: CommissionInput, now = new Date()): CommissionResult => {
  const contentDir = path.join(root, '.agency', 'content');
  const slug = slugify(input.opportunity.title);

  // CNT09-05 applied earlier: refuse the collision at write.
  const taken = existingTargetQueries(contentDir);
  const query = input.opportunity.targetQuery.trim().toLowerCase();
  const holder = taken.get(query);
  if (holder && holder !== slug) throw new TargetQueryCollisionError(input.opportunity.targetQuery, holder);

  const expires = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const trackerRef = `triage/brief-${slug}`;

  const brief: BriefArtifact = {
    slug,
    trackerRef,
    surface: input.opportunity.surface,
    targetQuery: input.opportunity.targetQuery,
    angle: input.angle,
    audience: input.audience,
    mustSupport: input.mustSupport,
    mustNotClaim: input.mustNotClaim,
    internalLinks: input.internalLinks,
    sourceBudget: input.sourceBudget,
    successMetric: input.successMetric,
    positioningHash: input.positioningHash,
    expiresAt: expires.toISOString().slice(0, 10),
  };
  assertValid('brief', brief, `brief ${slug}`);

  const dir = path.join(contentDir, 'briefs');
  mkdirSync(dir, { recursive: true });
  const briefFile = path.join(dir, `${slug}.yaml`);
  writeFileSync(briefFile, toYaml(brief));

  // Always Triage. The queue is a human's to fill (queue.ts), and the run
  // report notes whether there was room, so the human's decision is informed.
  const triage = new Triage(root);
  triage.fileItem({
    id: `brief-${slug}`,
    kind: 'proposed-brief',
    title: `proposed brief: ${input.opportunity.title}`,
    evidence: `bet: ${input.opportunity.bet} — evidence: ${input.opportunity.evidence.map((e) => `${e.artifact}#${e.ref}`).join(', ')}`,
    raw: `opportunity ${input.opportunity.id}; brief at .agency/content/briefs/${slug}.yaml`,
  });

  return { slug, briefFile, filedTo: 'triage', queueHadRoom: queueHasRoom(contentDir), trackerRef };
};
