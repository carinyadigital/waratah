/**
 * The audience researcher's demand artifact — jobs-to-be-done and the
 * language people actually use, each theme carrying its source and frequency.
 * Language is verbatim: paraphrasing the audience is how a farm ends up
 * writing like a marketing department.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { stringify as toYaml } from 'yaml';
import { assertValid } from '../../../packages/content-pipeline/src/validate';

export interface DemandTheme {
  theme: string;
  jobToBeDone: string;
  language: string[];
  source: 'support-triage' | 'on-site-search' | 'serp-intent' | 'comments' | 'replies';
  frequency: number;
}

export class DemandBuilder {
  private themes: DemandTheme[] = [];
  private couldNotDetermine: string[] = [];

  constructor(public readonly period: string) {}

  addTheme(theme: DemandTheme): void {
    if (!theme.language.length) throw new Error('a theme without verbatim language is a guess about the audience');
    if (theme.frequency < 1) throw new Error('a theme that appeared zero times is not a theme');
    this.themes.push(theme);
  }

  recordCouldNotDetermine(item: string): void {
    this.couldNotDetermine.push(item);
  }

  build() {
    const demand = { period: this.period, themes: this.themes, couldNotDetermine: this.couldNotDetermine };
    assertValid('demand', demand, `demand ${this.period}`);
    return demand;
  }

  writeTo(contentDir: string): string {
    const demand = this.build();
    const dir = path.join(contentDir, 'demand');
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${this.period}.yaml`);
    writeFileSync(file, toYaml(demand));
    return file;
  }
}
