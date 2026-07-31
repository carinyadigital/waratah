/**
 * Stale briefs expire (CNT06-S2). An unstarted brief is a stale opinion
 * about what mattered ninety days ago.
 *
 * Weekly, alongside the monitor. A brief whose expiresAt has passed and which
 * has no draft is moved to briefs/expired/, its tracker item is resolved out
 * of the ready queue, and the expiry is reported — never silent.
 */
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { hasDraft, listBriefSlugs, loadBrief, repoPaths } from '../../packages/content-pipeline/src/artifacts';
import { Triage } from '../../agents/content-monitor/agent/triage';

export interface ExpiryReport {
  expired: { slug: string; expiresAt: string; trackerRef: string }[];
  kept: string[];
}

export const sweepExpiredBriefs = (root: string, now = new Date()): ExpiryReport => {
  const paths = repoPaths(root);
  const triage = new Triage(root);
  const report: ExpiryReport = { expired: [], kept: [] };

  for (const slug of listBriefSlugs(paths)) {
    const brief = loadBrief(paths, slug);
    const started = hasDraft(paths, slug);
    const past = new Date(brief.expiresAt).getTime() < now.getTime();

    if (!past || started) {
      report.kept.push(slug);
      continue;
    }

    // Move out of the active briefs dir — the ready queue reads active briefs only.
    const expiredDir = path.join(paths.content, 'briefs', 'expired');
    mkdirSync(expiredDir, { recursive: true });
    renameSync(path.join(paths.content, 'briefs', `${slug}.yaml`), path.join(expiredDir, `${slug}.yaml`));

    // Resolve the tracker item if it lives in Triage; a Linear ref is reported for human action.
    if (brief.trackerRef.startsWith('triage/')) {
      triage.resolve(brief.trackerRef.slice('triage/'.length));
    }

    report.expired.push({ slug, expiresAt: brief.expiresAt, trackerRef: brief.trackerRef });
  }

  return report;
};

if (process.argv[1]?.endsWith('expiry-sweep.ts')) {
  const argIdx = process.argv.indexOf('--root');
  const root = argIdx >= 0 ? path.resolve(process.argv[argIdx + 1]) : process.cwd();
  const report = sweepExpiredBriefs(root);

  if (!report.expired.length) {
    console.log(`expiry sweep: nothing expired (${report.kept.length} brief(s) current or started)`);
  } else {
    console.log(`expiry sweep: ${report.expired.length} brief(s) expired — reported, not silent:`);
    for (const e of report.expired) {
      console.log(`  ${e.slug} (expired ${e.expiresAt}) — tracker ${e.trackerRef} moved out of the ready queue`);
    }
  }
}
