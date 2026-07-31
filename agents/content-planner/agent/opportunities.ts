/**
 * The synthesist's deterministic spine. The model proposes candidates at
 * runtime; this builder enforces what a candidate must carry to survive:
 * evidence refs into real artifacts, a stated bet, and automatic exclusion —
 * with the contradiction named — of anything tripping the claim policy's
 * prohibited patterns. An opportunity that cannot cite evidence is an
 * opinion with a schema.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { stringify as toYaml } from 'yaml';
import { assertValid } from '../../../packages/content-pipeline/src/validate';
import type { ClaimPolicy } from '../../../packages/content-pipeline/src/gates/types';

export interface OpportunityInput {
  title: string;
  targetQuery: string;
  surface: 'blog' | 'recipes' | 'landing' | 'newsletter';
  bet: string;
  evidence: { artifact: string; ref: string }[];
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

export class OpportunitiesBuilder {
  private opportunities: (OpportunityInput & { id: string })[] = [];
  private excluded: { title: string; reason: string }[] = [];

  constructor(
    public readonly period: string,
    public readonly positioningHash: string,
    private readonly claimPolicy: ClaimPolicy,
    private readonly basedOn: { reads?: string[]; demand?: string[]; landscape?: string[] },
  ) {
    const inputs = [...(basedOn.reads ?? []), ...(basedOn.demand ?? []), ...(basedOn.landscape ?? [])];
    if (!inputs.length) throw new Error('synthesis with no input artifacts is opinion — cite at least one read, demand or landscape');
  }

  /** Propose a candidate. Returns 'ranked' or 'excluded' (with the contradiction named). */
  propose(input: OpportunityInput): 'ranked' | 'excluded' {
    if (!input.evidence.length) throw new Error(`"${input.title}" cites no evidence — an opportunity rests on artifacts, not vibes`);
    if (input.bet.trim().length < 20) throw new Error(`"${input.title}" carries no stated bet — a topic is not a bet`);

    const text = `${input.title} ${input.bet}`;
    for (const p of this.claimPolicy.prohibited) {
      if (new RegExp(p.pattern, 'i').test(text)) {
        this.excluded.push({
          title: input.title,
          reason: `contradicts current positioning / claim policy [${p.id}]: ${p.reason}`,
        });
        return 'excluded';
      }
    }

    this.opportunities.push({ ...input, id: `opp-${slugify(input.title)}` });
    return 'ranked';
  }

  exclude(title: string, reason: string): void {
    this.excluded.push({ title, reason });
  }

  build() {
    const artifact = {
      period: this.period,
      positioningHash: this.positioningHash,
      basedOn: this.basedOn,
      opportunities: this.opportunities,
      excluded: this.excluded,
    };
    assertValid('opportunities', artifact, `opportunities ${this.period}`);
    return artifact;
  }

  writeTo(contentDir: string): string {
    const artifact = this.build();
    const dir = path.join(contentDir, 'opportunities');
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${this.period}.yaml`);
    writeFileSync(file, toYaml(artifact));
    return file;
  }
}
