/**
 * Single source for on-disk layout of team artifacts and governance ledgers.
 * Every reader and writer resolves paths through here so moves stay one file.
 */
import path from 'node:path';

export interface RepoPaths {
  root: string;
  /** Content-team operational artifacts (briefs, packs, drafts, …). */
  content: string;
  /** Work-queue mirror (monitor, capture). */
  triage: string;
  /** Distribution mirror (ESP drafts, send approvals). */
  distribution: string;
  /** Calibration ledger (decision classes, shadow, log). */
  calibration: string;
  /** Code-review / governance review records. */
  reviews: string;
  /** Built brand standards. */
  brandDist: string;
}

export const repoPaths = (root: string): RepoPaths => ({
  root,
  content: path.join(root, 'agents', 'content', 'artifacts'),
  triage: path.join(root, 'agents', 'content', 'artifacts', 'triage'),
  distribution: path.join(root, 'agents', 'content', 'artifacts', 'distribution'),
  calibration: path.join(root, 'governance', 'calibration'),
  reviews: path.join(root, 'governance', 'reviews'),
  brandDist: path.join(root, 'packages', 'brand', 'dist'),
});
