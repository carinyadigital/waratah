/**
 * CNT04-10/11/12 — pack emission against pack.schema.json.
 *
 * The collector enforces the researcher's two disciplines mechanically:
 * `sourceBudget` is a hard stop (add() refuses past the budget), and
 * couldNotVerify is a first-class output — including partial verifications —
 * not an afterthought. Validation happens at write.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { stringify as toYaml } from 'yaml';
import { assertValid } from '../../../packages/content-pipeline/src/validate';
import type { PackArtifact, PackEntry } from '../../../packages/content-pipeline/src/gates/types';

export class SourceBudgetExceededError extends Error {
  constructor(budget: number) {
    super(`sourceBudget of ${budget} reached — the budget is a hard stop, not a suggestion`);
  }
}

export class PackCollector {
  private entries: PackEntry[] = [];
  private couldNotVerify: { claim: string; note: string }[] = [];
  private nextId = 1;

  constructor(
    public readonly slug: string,
    public readonly sourceBudget: number,
  ) {
    if (sourceBudget < 1) throw new Error('sourceBudget must be at least 1');
  }

  get remaining(): number {
    return this.sourceBudget - this.entries.length;
  }

  /** Add a verified entry. Throws once the budget is reached — stop gathering. */
  add(entry: Omit<PackEntry, 'id'>): PackEntry {
    if (this.entries.length >= this.sourceBudget) throw new SourceBudgetExceededError(this.sourceBudget);
    const withId: PackEntry = { ...entry, id: `c${this.nextId}` };
    this.nextId += 1;
    this.entries.push(withId);
    return withId;
  }

  /**
   * Record something that could not be verified — or only partially verified.
   * Anything looked for and not sourced lands here rather than being omitted.
   */
  recordUnverified(claim: string, note: string): void {
    if (!note.trim()) throw new Error('couldNotVerify entries need a note of what was attempted');
    this.couldNotVerify.push({ claim, note });
  }

  /** Record a partial verification: keeps the honest half in couldNotVerify. */
  recordPartial(claim: string, verifiedPart: Omit<PackEntry, 'id'>, unverifiedRemainder: string): PackEntry {
    const entry = this.add(verifiedPart);
    this.recordUnverified(claim, `partially verified via ${entry.id}: ${unverifiedRemainder}`);
    return entry;
  }

  build(): PackArtifact {
    const pack: PackArtifact = {
      slug: this.slug,
      entries: this.entries,
      couldNotVerify: this.couldNotVerify,
    };
    assertValid('pack', pack, `pack ${this.slug}`);
    return pack;
  }

  writeTo(contentDir: string): string {
    const pack = this.build();
    const dir = path.join(contentDir, 'packs');
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${this.slug}.yaml`);
    writeFileSync(file, toYaml(pack));
    return file;
  }
}
