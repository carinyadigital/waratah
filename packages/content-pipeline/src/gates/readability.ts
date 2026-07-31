/**
 * Readability. Flesch reading ease, banded per surface.
 * Deterministic approximation; the band is the check, not the score's third
 * decimal place.
 */
import { textOf } from '../lexical/claim';
import type { Gate, GateResult } from './types';

const countSyllables = (word: string): number => {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const stripped = w.replace(/(?:[^laeiouy]e|ed|es)$/, '').replace(/^y/, '');
  const groups = stripped.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
};

export const fleschReadingEase = (text: string): number => {
  const sentences = Math.max(1, (text.match(/[.!?]+(?:\s|$)/g) ?? []).length);
  const words = text.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
  const wordCount = Math.max(1, words.length);
  const syllables = words.reduce((acc, w) => acc + countSyllables(w), 0);
  return 206.835 - 1.015 * (wordCount / sentences) - 84.6 * (syllables / wordCount);
};

export const readability: Gate = ({ draft, brand }): GateResult => {
  const failures: string[] = [];
  const surface = brand.surfaces[draft.surface];
  const score = fleschReadingEase(textOf(draft.content.root));

  if (surface) {
    const { minFlesch, maxFlesch } = surface.readability;
    if (score < minFlesch)
      failures.push(`Flesch ${score.toFixed(1)} is below the ${surface.id} band ${minFlesch}–${maxFlesch} — too dense`);
    if (score > maxFlesch)
      failures.push(`Flesch ${score.toFixed(1)} is above the ${surface.id} band ${minFlesch}–${maxFlesch} — too thin`);
  }

  return {
    gate: 'readability',
    status: failures.length ? 'fail' : 'pass',
    failures,
    notes: [`Flesch reading ease ${score.toFixed(1)}`],
  };
};
