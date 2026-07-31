/**
 * Prediction records and horizon scoring (design.md §4.5). At horizon the
 * prediction is scored regardless of whether anyone asked. Over a year the
 * calibration record — not report quality, not output volume — is the
 * measure of whether the analyst is worth its tokens.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml, stringify as toYaml } from 'yaml';

export interface PredictionRecord {
  id: string;
  period: string;
  action: string;
  target: string | null;
  claim: string;
  baseline: string;
  horizon: string;
  confidence: number;
  ifWrong: string;
  status: 'open' | 'due' | 'scored';
  createdAt: string;
  outcome?: 'correct' | 'wrong' | 'indeterminate';
  outcomeNote?: string;
  scoredAt?: string;
}

const predictionsDir = (contentDir: string) => path.join(contentDir, 'predictions');

export const listPredictions = (contentDir: string): PredictionRecord[] => {
  const dir = predictionsDir(contentDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => parseYaml(readFileSync(path.join(dir, f), 'utf8')) as PredictionRecord);
};

const write = (contentDir: string, record: PredictionRecord): void => {
  writeFileSync(path.join(predictionsDir(contentDir), `${record.id}.yaml`), toYaml(record));
};

/** The scheduled half: any open prediction past its horizon becomes due — visibly awaiting a score, never quietly forgotten. */
export const markDue = (contentDir: string, now = new Date()): PredictionRecord[] => {
  const due: PredictionRecord[] = [];
  for (const record of listPredictions(contentDir)) {
    if (record.status === 'open' && new Date(record.horizon).getTime() <= now.getTime()) {
      const updated: PredictionRecord = { ...record, status: 'due' };
      write(contentDir, updated);
      due.push(updated);
    }
  }
  return due;
};

/** The scoring half: a due (or open) prediction gets its outcome recorded against the re-runnable query. */
export const scorePrediction = (
  contentDir: string,
  id: string,
  outcome: 'correct' | 'wrong' | 'indeterminate',
  note: string,
): PredictionRecord => {
  const file = path.join(predictionsDir(contentDir), `${id}.yaml`);
  if (!existsSync(file)) throw new Error(`no prediction record ${id}`);
  const record = parseYaml(readFileSync(file, 'utf8')) as PredictionRecord;
  if (record.status === 'scored') throw new Error(`${id} is already scored — a score is not renegotiable`);
  if (!note.trim()) throw new Error('scoring requires a note of what the re-run showed');
  const updated: PredictionRecord = {
    ...record,
    status: 'scored',
    outcome,
    outcomeNote: note,
    scoredAt: new Date().toISOString(),
  };
  write(contentDir, updated);
  return updated;
};

export interface CalibrationSummary {
  scored: number;
  correct: number;
  hitRate: number | null;
  meanConfidence: number | null;
  /** hitRate − meanConfidence: negative means overconfident. Calibration is not accuracy. */
  calibrationGap: number | null;
  open: number;
  due: number;
}

export const calibrationSummary = (contentDir: string): CalibrationSummary => {
  const records = listPredictions(contentDir);
  const scored = records.filter((r) => r.status === 'scored' && r.outcome !== 'indeterminate');
  const correct = scored.filter((r) => r.outcome === 'correct').length;
  const meanConfidence = scored.length
    ? scored.reduce((acc, r) => acc + r.confidence, 0) / scored.length
    : null;
  const hitRate = scored.length ? correct / scored.length : null;
  return {
    scored: scored.length,
    correct,
    hitRate,
    meanConfidence,
    calibrationGap: hitRate !== null && meanConfidence !== null ? Number((hitRate - meanConfidence).toFixed(3)) : null,
    open: records.filter((r) => r.status === 'open').length,
    due: records.filter((r) => r.status === 'due').length,
  };
};
