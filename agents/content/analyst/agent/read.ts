/**
 * The read builder — every analyst discipline enforced at write, not by
 * instruction:
 *
 *  - questions are pre-registered: findings answer a question from
 *    questions.yaml or are labelled exploratory
 *  - every figure carries its exact query, n and window — re-runnable
 *  - alternativeExplanations non-empty per finding
 *  - the n-threshold gate: a figure below its source's declared n may be
 *    reported, but a directional claim on it is rejected at write
 *  - a recommendation must rest on at least one pre-registered finding —
 *    exploratory findings carry no recommendation alone
 *  - every recommendation carries a falsifiable prediction, recorded as its
 *    own artifact for horizon scoring
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml, stringify as toYaml } from 'yaml';
import { assertValid } from '@carinyaparc/content-pipeline';

export interface Figure {
  value: number | string;
  query: string;
  n: number;
  window: string;
  source?: 'ga4' | 'gsc' | 'ahrefs' | 'esp';
  direction?: 'up' | 'down' | 'flat';
}

export interface FindingInput {
  question?: string;
  finding: string;
  figures: Figure[];
  cluster: 'topic-area' | 'angle-type' | 'format' | 'funnel-intent';
  confidence: 'high' | 'medium' | 'low';
  alternativeExplanations: string[];
}

export interface Prediction {
  claim: string;
  baseline: string;
  horizon: string;
  confidence: number;
  ifWrong: string;
}

export interface RecommendationInput {
  action: 'write' | 'update' | 'consolidate' | 'redirect' | 'delete' | 'leave-alone';
  target?: string;
  rationale: string;
  basedOn: number[];
  prediction: Prediction;
}

export class NThresholdError extends Error {
  constructor(source: string, n: number, threshold: number) {
    super(
      `directional claim on a ${source} figure with n=${n}, below the declared threshold of ${threshold} — report the figure, drop the direction`,
    );
  }
}

export class UnregisteredQuestionError extends Error {
  constructor(question: string) {
    super(`"${question}" is not a pre-registered question — register it in questions.yaml (a reviewed diff) or mark the finding exploratory`);
  }
}

export const loadRegisteredQuestions = (agentDir: string): string[] => {
  const file = path.join(agentDir, 'questions.yaml');
  const parsed = parseYaml(readFileSync(file, 'utf8')) as { questions: { id: string; question: string }[] };
  return parsed.questions.map((q) => q.question);
};

export class ReadBuilder {
  private findings: (FindingInput & { exploratory: boolean })[] = [];
  private recommendations: RecommendationInput[] = [];
  private couldNotDetermine: string[] = [];

  constructor(
    public readonly period: string,
    public readonly positioningHash: string,
    private readonly registeredQuestions: string[],
    private readonly nThreshold: Record<string, number>,
  ) {}

  /** A finding answering a pre-registered question. */
  addFinding(input: FindingInput): number {
    if (!input.question) throw new Error('addFinding requires the pre-registered question; use addExploratory otherwise');
    if (!this.registeredQuestions.includes(input.question)) throw new UnregisteredQuestionError(input.question);
    return this.push(input, false);
  }

  /** A finding that answers no pre-registered question. Labelled, and carries no recommendation alone. */
  addExploratory(input: Omit<FindingInput, 'question'>): number {
    return this.push(input, true);
  }

  private push(input: FindingInput | Omit<FindingInput, 'question'>, exploratory: boolean): number {
    if (!input.alternativeExplanations?.length) {
      throw new Error('a finding without an alternative explanation is confidence, not care — rejected at write');
    }
    for (const figure of input.figures) {
      if (!figure.query?.trim() || figure.n === undefined || !figure.window?.trim()) {
        throw new Error('every figure carries its exact query, n and window — no exceptions');
      }
      if (figure.direction) {
        if (!figure.source) {
          throw new Error(
            `a directional figure needs its source (n=${figure.n}) — the n-threshold can't be checked without knowing which source's threshold applies; report the figure without a direction instead`,
          );
        }
        const threshold = this.nThreshold[figure.source];
        if (threshold !== undefined && figure.n < threshold) {
          throw new NThresholdError(figure.source, figure.n, threshold);
        }
      }
    }
    this.findings.push({ question: undefined, ...input, exploratory });
    return this.findings.length - 1;
  }

  addRecommendation(input: RecommendationInput): void {
    if (!input.basedOn.length) throw new Error('a recommendation must cite the findings it rests on');
    const cited = input.basedOn.map((i) => {
      const f = this.findings[i];
      if (!f) throw new Error(`recommendation cites finding ${i}, which does not exist`);
      return f;
    });
    if (cited.every((f) => f.exploratory)) {
      throw new Error('exploratory findings are labelled and carry no recommendation alone — pre-register the question and re-run');
    }
    this.recommendations.push(input);
  }

  recordCouldNotDetermine(item: string): void {
    this.couldNotDetermine.push(item);
  }

  build() {
    const read = {
      period: this.period,
      positioningHash: this.positioningHash,
      questions: this.registeredQuestions,
      findings: this.findings.map(({ question: _q, ...f }) => f),
      couldNotDetermine: this.couldNotDetermine,
      recommendations: this.recommendations.map(({ basedOn, ...r }) => ({ ...r, basedOn })),
    };
    assertValid('read', read, `read ${this.period}`);
    return read;
  }

  /** Write the read and its prediction records. Idempotent on period. */
  writeTo(contentDir: string): { readFile: string; predictionFiles: string[] } {
    const read = this.build();
    const readsDir = path.join(contentDir, 'reads');
    mkdirSync(readsDir, { recursive: true });
    const readFile = path.join(readsDir, `${this.period}.yaml`);
    writeFileSync(readFile, toYaml(read));

    const predictionsDir = path.join(contentDir, 'predictions');
    mkdirSync(predictionsDir, { recursive: true });
    const predictionFiles: string[] = [];
    this.recommendations.forEach((rec, i) => {
      const id = `${this.period}-r${i + 1}`;
      const file = path.join(predictionsDir, `${id}.yaml`);
      if (!existsSync(file)) {
        writeFileSync(
          file,
          toYaml({
            id,
            period: this.period,
            action: rec.action,
            target: rec.target ?? null,
            ...rec.prediction,
            status: 'open',
            createdAt: new Date().toISOString(),
          }),
        );
      }
      predictionFiles.push(file);
    });

    return { readFile, predictionFiles };
  }
}
