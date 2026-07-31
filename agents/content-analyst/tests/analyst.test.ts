import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import {
  loadRegisteredQuestions,
  NThresholdError,
  ReadBuilder,
  UnregisteredQuestionError,
  type FindingInput,
} from '../agent/read';
import { DemandBuilder } from '../agent/demand';
import { calibrationSummary, markDue, scorePrediction } from '../agent/predictions';
import { recommendNothingRatio, renderAnalystRunReport } from '../agent/runReport';

const here = path.dirname(fileURLToPath(import.meta.url));
const agentDir = path.join(here, '..');
const questions = loadRegisteredQuestions(agentDir);
const HASH = 'a'.repeat(64);
const THRESHOLDS = { ga4: 400, gsc: 200, ahrefs: 100, esp: 150 };

const finding = (over: Partial<FindingInput> = {}): FindingInput => ({
  question: questions[0],
  finding: 'Subscriber growth held flat against baseline',
  figures: [{ value: 42, query: 'esp: net_new_subscribers window=7d', n: 700, window: '7d', source: 'esp' }],
  cluster: 'topic-area',
  confidence: 'medium',
  alternativeExplanations: ['School holidays shifted the traffic mix'],
  ...over,
});

const builder = () => new ReadBuilder('2026-W31', HASH, questions, THRESHOLDS);

describe('question pre-registration', () => {
  it('loads the pre-registered questions from config, not per run', () => {
    expect(questions.length).toBeGreaterThanOrEqual(5);
  });

  it('refuses a finding against an unregistered question', () => {
    expect(() => builder().addFinding(finding({ question: 'What secretly happened to traffic?' }))).toThrow(
      UnregisteredQuestionError,
    );
  });

  it('exploratory findings are labelled and carry no recommendation alone', () => {
    const b = builder();
    const i = b.addExploratory({ ...finding(), question: undefined } as never);
    expect(() =>
      b.addRecommendation({
        action: 'write',
        rationale: 'exploratory hunch about a topic',
        basedOn: [i],
        prediction: { claim: 'a piece would gain subscribers', baseline: '0', horizon: '2026-10-01', confidence: 0.5, ifWrong: 'the hunch was noise' },
      }),
    ).toThrow(/exploratory/);
  });
});

describe('figures are auditable', () => {
  it('rejects a figure without query, n or window', () => {
    expect(() =>
      builder().addFinding(finding({ figures: [{ value: 3, query: ' ', n: 10, window: '7d' }] })),
    ).toThrow(/query, n and window/);
  });

  it('rejects a finding with no alternative explanation', () => {
    expect(() => builder().addFinding(finding({ alternativeExplanations: [] }))).toThrow(/alternative/);
  });
});

describe('the n-threshold gate', () => {
  it('a below-threshold figure may be reported without a direction', () => {
    const b = builder();
    expect(() =>
      b.addFinding(finding({ figures: [{ value: 12, query: 'ga4: sessions cluster=recipes', n: 90, window: '7d', source: 'ga4' }] })),
    ).not.toThrow();
  });

  it('a directional claim on a below-threshold figure is rejected at write', () => {
    expect(() =>
      builder().addFinding(
        finding({
          figures: [{ value: 12, query: 'ga4: sessions cluster=recipes', n: 90, window: '7d', source: 'ga4', direction: 'up' }],
        }),
      ),
    ).toThrow(NThresholdError);
  });

  it('the same directional claim above threshold passes', () => {
    expect(() =>
      builder().addFinding(
        finding({
          figures: [{ value: 1200, query: 'ga4: sessions cluster=recipes', n: 900, window: '7d', source: 'ga4', direction: 'up' }],
        }),
      ),
    ).not.toThrow();
  });

  it('a directional claim with no source is rejected, however small n is — the threshold cannot be checked blind', () => {
    expect(() =>
      builder().addFinding(
        finding({
          figures: [{ value: 12, query: 'ga4: sessions cluster=recipes', n: 3, window: '7d', direction: 'up' }],
        }),
      ),
    ).toThrow(/needs its source/);
  });
});

describe('reads, predictions and the run report', () => {
  const scaffold = () => {
    const root = mkdtempSync(path.join(tmpdir(), 'analyst-'));
    const contentDir = path.join(root, '.agency', 'content');
    mkdirSync(contentDir, { recursive: true });
    return contentDir;
  };

  it('writes a schema-valid read and a prediction record per recommendation', () => {
    const contentDir = scaffold();
    const b = builder();
    const i = b.addFinding(finding());
    b.recordCouldNotDetermine('whether the CTA move or the school holidays drove the recipe dip');
    b.addRecommendation({
      action: 'update',
      target: 'recipes-cluster',
      rationale: 'decaying clicks with steady impressions across the cluster',
      basedOn: [i],
      prediction: {
        claim: 'refreshing the top three recipe pages lifts cluster clicks 15% against baseline',
        baseline: '820 clicks/28d',
        horizon: '2026-10-26',
        confidence: 0.6,
        ifWrong: 'decay is intent shift, not staleness — refreshes are the wrong lever for this cluster',
      },
    });

    const { readFile, predictionFiles } = b.writeTo(contentDir);
    const read = parseYaml(readFileSync(readFile, 'utf8'));
    expect(read.questions).toEqual(questions);
    expect(predictionFiles).toHaveLength(1);

    const record = parseYaml(readFileSync(predictionFiles[0], 'utf8'));
    expect(record.status).toBe('open');
    expect(record.ifWrong).toContain('intent shift');
  });

  it('horizon scoring: due at horizon regardless of interest, scored with a note, calibration summarised', () => {
    const contentDir = scaffold();
    const b = builder();
    const i = b.addFinding(finding());
    b.addRecommendation({
      action: 'leave-alone',
      rationale: 'movement within noise',
      basedOn: [i],
      prediction: { claim: 'cluster holds within 10% of baseline', baseline: '820', horizon: '2026-08-01', confidence: 0.8, ifWrong: 'there was a real trend we dismissed' },
    });
    b.writeTo(contentDir);

    const due = markDue(contentDir, new Date('2026-08-02'));
    expect(due).toHaveLength(1);
    expect(due[0].status).toBe('due');

    expect(() => scorePrediction(contentDir, due[0].id, 'correct', '')).toThrow(/note/);
    const scored = scorePrediction(contentDir, due[0].id, 'correct', 're-ran esp query: 801 vs baseline 820, within band');
    expect(scored.status).toBe('scored');
    expect(() => scorePrediction(contentDir, due[0].id, 'wrong', 'changed my mind')).toThrow(/already scored/);

    const summary = calibrationSummary(contentDir);
    expect(summary.scored).toBe(1);
    expect(summary.correct).toBe(1);
  });

  it('the recommend-nothing ratio is tracked and appears in the run report', () => {
    const contentDir = scaffold();
    const quiet = builder();
    quiet.addFinding(finding());
    quiet.writeTo(contentDir);

    const busy = new ReadBuilder('2026-W32', HASH, questions, THRESHOLDS);
    const i = busy.addFinding(finding());
    busy.addRecommendation({
      action: 'consolidate',
      target: 'planting-guides',
      rationale: 'two thin pages splitting one query',
      basedOn: [i],
      prediction: { claim: 'consolidated page outranks both within 90 days', baseline: 'positions 8 and 11', horizon: '2026-10-29', confidence: 0.55, ifWrong: 'the query is navigational and the split was harmless' },
    });
    busy.writeTo(contentDir);

    const ratio = recommendNothingRatio(contentDir);
    expect(ratio.periods).toBe(2);
    expect(ratio.nothingPeriods).toBe(1);
    expect(ratio.ratio).toBe(0.5);

    const report = renderAnalystRunReport(busy.build() as never, contentDir);
    expect(report).toContain('Recommend-nothing ratio');
    expect(report).toContain('1/2 periods');
  });

  it('demand artifacts carry verbatim language, source and frequency per theme', () => {
    const contentDir = scaffold();
    const d = new DemandBuilder('2026-W31');
    d.addTheme({
      theme: 'visitors want to know if kids can come',
      jobToBeDone: 'Plan a family visit without emailing first',
      language: ['can we bring the kids', 'is it pram friendly'],
      source: 'support-triage',
      frequency: 3,
    });
    expect(() =>
      d.addTheme({ theme: 'x', jobToBeDone: 'a guess about people', language: [], source: 'comments', frequency: 1 }),
    ).toThrow(/verbatim/);
    const file = d.writeTo(contentDir);
    const demand = parseYaml(readFileSync(file, 'utf8'));
    expect(demand.themes[0].language).toContain('can we bring the kids');
  });
});
