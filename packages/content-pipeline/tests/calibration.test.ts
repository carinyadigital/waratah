import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml, stringify as toYaml } from 'yaml';
import {
  agreementRate,
  loadClasses,
  queryClass,
  recordHumanDecision,
  recordShadowVerdict,
  runLevelsEngine,
  qualifiesForLevel,
  shadowExists,
  ShadowProtocolError,
} from '../src/calibration';

const here = path.dirname(fileURLToPath(import.meta.url));
const seedFile = path.resolve(here, '../../../.agency/calibration/decision-classes.yaml');

const scaffold = (): string => {
  const root = mkdtempSync(path.join(tmpdir(), 'calibration-'));
  mkdirSync(path.join(root, '.agency/calibration'), { recursive: true });
  cpSync(seedFile, path.join(root, '.agency/calibration/decision-classes.yaml'));
  return root;
};

describe('decision classes are named and levelled', () => {
  it('seeds match the starting positions for each decision class', () => {
    const byId = Object.fromEntries(loadClasses(scaffold()).map((c) => [c.id, c]));
    expect(byId['structural-schema-conformance'].level).toBe(4);
    expect(byId['link-prohibition-checks'].level).toBe(4);
    expect(byId['claim-traceability'].level).toBe(4);
    expect(byId['figure-rederivation'].level).toBe(1);
    expect(byId['draft-quality'].level).toBe(0);
    expect(byId['what-to-commission'].level).toBe(0);
    expect(byId['publish-send-spend'].level).toBe(0);
    expect(byId['publish-send-spend'].ceiling).toBe(0);
  });

  it('a queried class returns level, sample size and last review date', () => {
    const root = scaffold();
    const cls = queryClass(root, 'figure-rederivation');
    expect(cls.level).toBe(1);
    expect(cls.sampleSize).toBe(0);
    expect(cls.lastReviewedAt).toBeUndefined();
  });
});

describe('the shadow protocol', () => {
  it('records the agent verdict before the human decides, and pairs both against the item', () => {
    const root = scaffold();
    recordShadowVerdict(root, 'figure-rederivation', 'w31-f0', 'reproduces');
    expect(shadowExists(root, 'figure-rederivation', 'w31-f0')).toBe(true);

    const observation = recordHumanDecision(root, 'figure-rederivation', 'w31-f0', 'reproduces');
    expect(observation.agrees).toBe(true);
    expect(observation.agentRecordedAt < observation.humanDecidedAt!).toBe(true);
  });

  it('refuses an agent verdict arriving after the human decision — no longer independent', () => {
    const root = scaffold();
    recordShadowVerdict(root, 'figure-rederivation', 'w31-f1', 'reproduces');
    recordHumanDecision(root, 'figure-rederivation', 'w31-f1', 'does-not-reproduce');
    expect(() => recordShadowVerdict(root, 'figure-rederivation', 'w31-f1', 'does-not-reproduce')).toThrow(
      ShadowProtocolError,
    );
  });

  it('refuses a human decision with no shadow on record at level 1', () => {
    const root = scaffold();
    expect(() => recordHumanDecision(root, 'figure-rederivation', 'w31-f2', 'reproduces')).toThrow(/before the human/);
  });

  it('pairs verdicts into the review record when the item is a published slug', () => {
    const root = scaffold();
    const reviewsDir = path.join(root, '.agency/content/reviews');
    mkdirSync(reviewsDir, { recursive: true });
    writeFileSync(path.join(reviewsDir, 'some-piece.yaml'), toYaml({ slug: 'some-piece', humanScore: 4 }));

    recordShadowVerdict(root, 'figure-rederivation', 'some-piece', 'reproduces');
    recordHumanDecision(root, 'figure-rederivation', 'some-piece', 'reproduces');

    const review = parseYaml(readFileSync(path.join(reviewsDir, 'some-piece.yaml'), 'utf8'));
    expect(review.shadow.verdicts).toHaveLength(1);
    expect(review.shadow.verdicts[0].agrees).toBe(true);
  });
});

const fillLedger = (root: string, classId: string, n: number, agrees = true) => {
  for (let i = 0; i < n; i += 1) {
    recordShadowVerdict(root, classId, `item-${i}`, 'reproduces');
    recordHumanDecision(root, classId, `item-${i}`, agrees ? 'reproduces' : 'does-not-reproduce');
  }
};

describe('levels move on evidence, automatically', () => {
  it('promotes one level on agreement above threshold across a full window with no severe miss', () => {
    const root = scaffold();
    fillLedger(root, 'figure-rederivation', 12);
    const changes = runLevelsEngine(root);
    const change = changes.find((c) => c.classId === 'figure-rederivation');
    expect(change).toMatchObject({ kind: 'promotion', from: 1, to: 2 });
    expect(queryClass(root, 'figure-rederivation').level).toBe(2);
  });

  it('does not promote on a thin sample, whatever the rate', () => {
    const root = scaffold();
    fillLedger(root, 'figure-rederivation', 3);
    expect(runLevelsEngine(root)).toHaveLength(0);
  });

  it('a severe miss drops the class two levels immediately and is logged', () => {
    const root = scaffold();
    fillLedger(root, 'figure-rederivation', 12);
    runLevelsEngine(root); // now at 2
    recordShadowVerdict(root, 'figure-rederivation', 'the-bad-one', 'reproduces');
    recordHumanDecision(root, 'figure-rederivation', 'the-bad-one', 'fabricated-figure', { severeMiss: true });
    expect(queryClass(root, 'figure-rederivation').level).toBe(0);

    const log = parseYaml(readFileSync(path.join(root, '.agency/calibration/log.yaml'), 'utf8'));
    const kinds = log.changes.map((c: { kind: string }) => c.kind);
    expect(kinds).toContain('promotion');
    expect(kinds).toContain('demotion');
  });

  it('a severe miss is not demoted again by the levels engine', () => {
    const root = scaffold();
    const classes = loadClasses(root);
    const cls = classes.find((c) => c.id === 'figure-rederivation')!;
    cls.level = 4;
    writeFileSync(path.join(root, '.agency/calibration/decision-classes.yaml'), toYaml({ classes }));

    recordShadowVerdict(root, 'figure-rederivation', 'the-bad-one', 'reproduces');
    recordHumanDecision(root, 'figure-rederivation', 'the-bad-one', 'fabricated-figure', { severeMiss: true });
    expect(queryClass(root, 'figure-rederivation').level).toBe(2);

    // The same severe miss is still inside the trailing window; a second pass must not re-demote it.
    const changes = runLevelsEngine(root);
    expect(changes.find((c) => c.classId === 'figure-rederivation')).toBeUndefined();
    expect(queryClass(root, 'figure-rederivation').level).toBe(2);
  });

  it('never promotes past the ceiling', () => {
    const root = scaffold();
    fillLedger(root, 'what-to-commission', 10);
    runLevelsEngine(root); // 0 → 1
    runLevelsEngine(root); // 1 → 2 (ceiling)
    const third = runLevelsEngine(root);
    expect(queryClass(root, 'what-to-commission').level).toBe(2);
    expect(third.find((c) => c.classId === 'what-to-commission')).toBeUndefined();
  });
});

describe('R12 — the rule the ledger makes checkable', () => {
  it('a judgement class at level 3 without a qualifying record fails; with one, passes', () => {
    const root = scaffold();
    const classes = loadClasses(root);
    const cls = classes.find((c) => c.id === 'figure-rederivation')!;
    cls.level = 3;
    writeFileSync(path.join(root, '.agency/calibration/decision-classes.yaml'), toYaml({ classes }));

    expect(qualifiesForLevel(root, cls).ok).toBe(false);

    fillLedger(root, 'figure-rederivation', 12);
    expect(qualifiesForLevel(root, cls).ok).toBe(true);
  });

  it('agreement over the window is computed with rate and severe misses', () => {
    const root = scaffold();
    fillLedger(root, 'figure-rederivation', 8, true);
    fillLedger(root, 'draft-quality', 4, false);
    expect(agreementRate(root, 'figure-rederivation').agreementRate).toBe(1);
    expect(agreementRate(root, 'draft-quality').agreementRate).toBe(0);
  });

  it('a window of 0 counts no observations, not the whole ledger', () => {
    const root = scaffold();
    const classes = loadClasses(root);
    const cls = classes.find((c) => c.id === 'figure-rederivation')!;
    cls.window = 0;
    writeFileSync(path.join(root, '.agency/calibration/decision-classes.yaml'), toYaml({ classes }));

    fillLedger(root, 'figure-rederivation', 5);
    const report = agreementRate(root, 'figure-rederivation');
    expect(report.observed).toBe(0);
    expect(report.agreementRate).toBeNull();
  });
});
