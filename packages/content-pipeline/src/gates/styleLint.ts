/**
 * CNT02-09 (part) — style lint. banned-words.json plus per-surface rules.
 * Catches banned words, not bad writing (design.md §12).
 */
import { textOf } from '../lexical/claim';
import type { Gate, GateResult } from './types';

const phraseRe = (term: string): RegExp =>
  new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}\\b`, 'i');

export const styleLint: Gate = ({ draft, brand }): GateResult => {
  const failures: string[] = [];
  const text = `${draft.title} ${textOf(draft.content.root)}`;

  const lists = [
    ...brand.bannedWords.banned,
    ...(brand.bannedWords.perSurface?.[draft.surface] ?? []),
  ];

  for (const item of lists) {
    const m = text.match(phraseRe(item.term));
    if (m) {
      const instead = 'instead' in item && item.instead ? `; try "${item.instead}"` : '';
      failures.push(`banned term "${m[0]}" (${item.reason}${instead})`);
    }
  }

  return { gate: 'style-lint', status: failures.length ? 'fail' : 'pass', failures };
};
