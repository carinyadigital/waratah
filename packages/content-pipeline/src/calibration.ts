/**
 * The calibration ledger. Not a reviewer — the record that would justify
 * trusting one.
 *
 * The shadow protocol's hiding requirement is the whole validity of the
 * exercise: the agent's verdict is recorded before the human decides, the
 * human decides without seeing it, and a verdict arriving after the human
 * decision is refused — it is no longer an independent measurement.
 *
 * Levels move on evidence, automatically, and every move is logged:
 * promotion needs agreement above the class threshold across a full window
 * with zero severe misses; one severe miss drops the class two levels.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml, stringify as toYaml } from 'yaml';

export interface DecisionClass {
  id: string;
  description: string;
  basis: 'deterministic-check' | 'agent-judgement' | 'never';
  level: number;
  ceiling: number;
  agreementThreshold?: number;
  window?: number;
  minSample?: number;
  lastReviewedAt?: string;
}

export interface Observation {
  item: string;
  agentVerdict: string;
  agentRecordedAt: string;
  humanVerdict?: string;
  humanDecidedAt?: string;
  agrees?: boolean;
  severeMiss?: boolean;
}

export interface LevelChange {
  classId: string;
  from: number;
  to: number;
  kind: 'promotion' | 'demotion';
  reason: string;
  at: string;
}

const calibrationDir = (root: string) => path.join(root, '.agency', 'calibration');
const classesFile = (root: string) => path.join(calibrationDir(root), 'decision-classes.yaml');
const shadowFile = (root: string, classId: string, item: string) =>
  path.join(calibrationDir(root), 'shadow', classId, `${item}.yaml`);
const ledgerFile = (root: string, classId: string) => path.join(calibrationDir(root), 'ledger', `${classId}.yaml`);
const logFile = (root: string) => path.join(calibrationDir(root), 'log.yaml');

export const loadClasses = (root: string): DecisionClass[] => {
  const parsed = parseYaml(readFileSync(classesFile(root), 'utf8')) as { classes: DecisionClass[] };
  return parsed.classes;
};

const saveClasses = (root: string, classes: DecisionClass[]): void => {
  writeFileSync(classesFile(root), toYaml({ classes }));
};

/** Level, sample size and last review date are returned on query. */
export const queryClass = (root: string, classId: string): DecisionClass & { sampleSize: number } => {
  const cls = loadClasses(root).find((c) => c.id === classId);
  if (!cls) throw new Error(`unknown decision class "${classId}"`);
  return { ...cls, sampleSize: loadLedger(root, classId).length };
};

export const loadLedger = (root: string, classId: string): Observation[] => {
  const file = ledgerFile(root, classId);
  if (!existsSync(file)) return [];
  return (parseYaml(readFileSync(file, 'utf8')) as { observations: Observation[] }).observations ?? [];
};

const saveLedger = (root: string, classId: string, observations: Observation[]): void => {
  mkdirSync(path.dirname(ledgerFile(root, classId)), { recursive: true });
  writeFileSync(ledgerFile(root, classId), toYaml({ observations }));
};

const appendLog = (root: string, change: LevelChange): void => {
  const file = logFile(root);
  const log = existsSync(file) ? ((parseYaml(readFileSync(file, 'utf8')) as { changes: LevelChange[] }).changes ?? []) : [];
  log.push(change);
  writeFileSync(file, toYaml({ changes: log }));
};

export class ShadowProtocolError extends Error {}

/** The agent's verdict, recorded before the human decides, invisible to them while deciding. */
export const recordShadowVerdict = (root: string, classId: string, item: string, verdict: string): void => {
  const cls = loadClasses(root).find((c) => c.id === classId);
  if (!cls) throw new Error(`unknown decision class "${classId}"`);
  if (cls.basis !== 'agent-judgement') {
    throw new ShadowProtocolError(`class "${classId}" is ${cls.basis} — shadow verdicts apply to agent-judgement classes at level 1+`);
  }
  if (loadLedger(root, classId).some((o) => o.item === item)) {
    throw new ShadowProtocolError(
      `the human already decided "${item}" — a verdict recorded after the decision is not an independent measurement`,
    );
  }
  const file = shadowFile(root, classId, item);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, toYaml({ item, verdict, recordedAt: new Date().toISOString() }));
};

/** What the human-facing review flow may know: whether a shadow verdict exists — never what it says. */
export const shadowExists = (root: string, classId: string, item: string): boolean =>
  existsSync(shadowFile(root, classId, item));

/**
 * The human decides (without seeing the shadow), and both verdicts are stored
 * against the item, paired into the class ledger and — when the item is a
 * published slug — into its review record.
 */
export const recordHumanDecision = (
  root: string,
  classId: string,
  item: string,
  humanVerdict: string,
  options: { severeMiss?: boolean } = {},
): Observation => {
  const file = shadowFile(root, classId, item);
  if (!existsSync(file)) {
    throw new ShadowProtocolError(`no shadow verdict for "${item}" — at level 1 the agent's verdict is recorded before the human decides`);
  }
  const shadow = parseYaml(readFileSync(file, 'utf8')) as { verdict: string; recordedAt: string };

  const observation: Observation = {
    item,
    agentVerdict: shadow.verdict,
    agentRecordedAt: shadow.recordedAt,
    humanVerdict,
    humanDecidedAt: new Date().toISOString(),
    agrees: shadow.verdict === humanVerdict,
    severeMiss: options.severeMiss ?? false,
  };

  const ledger = loadLedger(root, classId);
  ledger.push(observation);
  saveLedger(root, classId, ledger);

  // Pair into the review record when one exists for this item.
  const reviewFile = path.join(root, '.agency', 'content', 'reviews', `${item}.yaml`);
  if (existsSync(reviewFile)) {
    const review = parseYaml(readFileSync(reviewFile, 'utf8')) as Record<string, unknown>;
    const shadowBlock = (review.shadow as { verdicts: unknown[] } | undefined) ?? { verdicts: [] };
    shadowBlock.verdicts.push({
      decisionClass: classId,
      verdict: shadow.verdict,
      recordedAt: shadow.recordedAt,
      humanVerdict,
      agrees: observation.agrees,
    });
    review.shadow = shadowBlock;
    writeFileSync(reviewFile, toYaml(review));
  }

  // A severe miss demotes immediately, at the moment it is known.
  if (observation.severeMiss) {
    applyDemotion(root, classId, `severe miss on "${item}"`);
  }

  return observation;
};

export interface AgreementReport {
  classId: string;
  window: number;
  observed: number;
  agreements: number;
  agreementRate: number | null;
  severeMisses: number;
}

/** Agreement rate per class over the rolling window. */
export const agreementRate = (root: string, classId: string): AgreementReport => {
  const cls = loadClasses(root).find((c) => c.id === classId);
  if (!cls) throw new Error(`unknown decision class "${classId}"`);
  const window = cls.window ?? 20;
  const recent = loadLedger(root, classId).slice(-window);
  const agreements = recent.filter((o) => o.agrees).length;
  return {
    classId,
    window,
    observed: recent.length,
    agreements,
    agreementRate: recent.length ? Number((agreements / recent.length).toFixed(3)) : null,
    severeMisses: recent.filter((o) => o.severeMiss).length,
  };
};

const applyDemotion = (root: string, classId: string, reason: string): void => {
  const classes = loadClasses(root);
  const cls = classes.find((c) => c.id === classId)!;
  const to = Math.max(0, cls.level - 2);
  if (to !== cls.level) {
    appendLog(root, { classId, from: cls.level, to, kind: 'demotion', reason, at: new Date().toISOString() });
    cls.level = to;
    cls.lastReviewedAt = new Date().toISOString();
    saveClasses(root, classes);
  }
};

/**
 * The levels engine. Promotion: agreement above threshold across a full
 * window of that class, zero severe misses in window, one level at a time,
 * never past the ceiling. Demotion for severe misses is applied at decision
 * time; this pass also catches any recorded but unapplied ones.
 */
export const runLevelsEngine = (root: string): LevelChange[] => {
  const classes = loadClasses(root);
  const changes: LevelChange[] = [];

  for (const cls of classes) {
    if (cls.basis !== 'agent-judgement') continue;
    const report = agreementRate(root, cls.id);

    if (report.severeMisses > 0 && cls.level > 0) {
      const to = Math.max(0, cls.level - 2);
      const change: LevelChange = {
        classId: cls.id,
        from: cls.level,
        to,
        kind: 'demotion',
        reason: `${report.severeMisses} severe miss(es) in window`,
        at: new Date().toISOString(),
      };
      appendLog(root, change);
      cls.level = to;
      cls.lastReviewedAt = change.at;
      changes.push(change);
      continue;
    }

    const full = report.observed >= (cls.minSample ?? report.window);
    const above = report.agreementRate !== null && report.agreementRate >= (cls.agreementThreshold ?? 1);
    if (full && above && cls.level < cls.ceiling) {
      const change: LevelChange = {
        classId: cls.id,
        from: cls.level,
        to: cls.level + 1,
        kind: 'promotion',
        reason: `agreement ${report.agreementRate} over ${report.observed} observations, no severe miss`,
        at: new Date().toISOString(),
      };
      appendLog(root, change);
      cls.level += 1;
      cls.lastReviewedAt = change.at;
      changes.push(change);
    }
  }

  saveClasses(root, classes);
  return changes;
};

/** R12's question: does a judgement class at level ≥ 3 hold a qualifying record? */
export const qualifiesForLevel = (root: string, cls: DecisionClass): { ok: boolean; reason: string } => {
  if (cls.basis !== 'agent-judgement' || cls.level < 3) return { ok: true, reason: 'not subject to R12' };
  const report = agreementRate(root, cls.id);
  if (report.observed < (cls.minSample ?? report.window)) {
    return { ok: false, reason: `level ${cls.level} with only ${report.observed} observation(s), below minSample ${cls.minSample}` };
  }
  if (report.agreementRate === null || report.agreementRate < (cls.agreementThreshold ?? 1)) {
    return { ok: false, reason: `level ${cls.level} with agreement ${report.agreementRate}, below threshold ${cls.agreementThreshold}` };
  }
  if (report.severeMisses > 0) {
    return { ok: false, reason: `level ${cls.level} with ${report.severeMisses} severe miss(es) in window` };
  }
  return { ok: true, reason: 'qualifying record present' };
};
