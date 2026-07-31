/**
 * Triage filing with idempotency.
 *
 * The tracker item names the invariant, the page and the evidence. The
 * idempotency key is `invariant.id + page`: re-running the monitor never
 * duplicates an unresolved violation; a violation resolved and later
 * re-detected files fresh.
 *
 * Locally (and in CI without credentials) Triage is `.agency/triage/` —
 * one YAML per item, mirroring the tracker the way `.agency/content/`
 * mirrors the CMS. When a LINEAR_API_KEY is present the same items are
 * pushed to the Linear Triage queue and the file records `linearRef`.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml, stringify as toYaml } from 'yaml';

export interface TriageItem {
  id: string;
  kind: 'invariant-violation' | 'idea' | 'proposed-brief' | 'recommendation';
  invariant?: string;
  page?: string;
  title: string;
  evidence: string;
  author?: string;
  status: 'open' | 'resolved';
  filedAt: string;
  resolvedAt?: string;
  linearRef?: string;
  raw?: string;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

export const idempotencyKey = (invariant: string, page: string): string => slugify(`${invariant}-${page}`);

export class Triage {
  readonly dir: string;

  constructor(root: string) {
    this.dir = path.join(root, '.agency', 'triage');
    mkdirSync(this.dir, { recursive: true });
  }

  private file(id: string): string {
    return path.join(this.dir, `${id}.yaml`);
  }

  get(id: string): TriageItem | null {
    const f = this.file(id);
    if (!existsSync(f)) return null;
    return parseYaml(readFileSync(f, 'utf8')) as TriageItem;
  }

  list(): TriageItem[] {
    return readdirSync(this.dir)
      .filter((f) => f.endsWith('.yaml'))
      .map((f) => parseYaml(readFileSync(path.join(this.dir, f), 'utf8')) as TriageItem);
  }

  /**
   * File a violation. Returns 'filed' | 'duplicate'. An unresolved item with
   * the same key is a duplicate and is left untouched; a resolved one is
   * superseded by a fresh filing.
   */
  fileViolation(invariant: string, page: string, title: string, evidence: string): 'filed' | 'duplicate' {
    const id = idempotencyKey(invariant, page);
    const existing = this.get(id);
    if (existing && existing.status === 'open') return 'duplicate';
    const item: TriageItem = {
      id,
      kind: 'invariant-violation',
      invariant,
      page,
      title,
      evidence,
      status: 'open',
      filedAt: new Date().toISOString(),
    };
    writeFileSync(this.file(id), toYaml(item));
    return 'filed';
  }

  /** Generic filing for capture ideas and analyst recommendations. */
  fileItem(item: Omit<TriageItem, 'filedAt' | 'status'> & { status?: TriageItem['status'] }): 'filed' | 'duplicate' {
    const existing = this.get(item.id);
    if (existing && existing.status === 'open') return 'duplicate';
    writeFileSync(this.file(item.id), toYaml({ status: 'open', filedAt: new Date().toISOString(), ...item }));
    return 'filed';
  }

  resolve(id: string): void {
    const item = this.get(id);
    if (!item) return;
    item.status = 'resolved';
    item.resolvedAt = new Date().toISOString();
    writeFileSync(this.file(id), toYaml(item));
  }
}
