/**
 * CNT04-08 — editDistance and editLocus, computed from the staged draft
 * versus the published document (design.md §8).
 *
 * The diff is free with every piece and diagnostic in a way analytics never
 * will be: structure survives / sentences rewritten → voice problem; prose
 * survives / argument reordered → brief problem; gate attempts high / edit
 * distance low → the gates are wrong, not the writer.
 */
import { textOf, walk, type LexicalDocument, type SerializedLexicalNode } from './lexical/claim';

export interface Section {
  name: string;
  words: string[];
}

const words = (s: string): string[] => s.toLowerCase().split(/\s+/).filter(Boolean);

/** Split a document into sections at h2/h3 headings. Content before any heading is "lead". */
export const sections = (doc: LexicalDocument): Section[] => {
  const out: Section[] = [];
  let current: Section = { name: 'lead', words: [] };
  for (const child of doc.root.children ?? []) {
    if (child.type === 'heading') {
      if (current.words.length) out.push(current);
      current = { name: textOf(child), words: [] };
    } else {
      current.words.push(...words(textOf(child)));
    }
  }
  if (current.words.length) out.push(current);
  return out;
};

/** Longest common subsequence length over word arrays. */
const lcs = (a: string[], b: string[]): number => {
  if (!a.length || !b.length) return 0;
  const prev = new Array<number>(b.length + 1).fill(0);
  const curr = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], curr[j - 1]);
    }
    prev.splice(0, prev.length, ...curr);
  }
  return prev[b.length];
};

export interface EditReport {
  /** Fraction of the staged draft's words surviving to publish. 1.0 = untouched. */
  editDistance: number;
  /** Sections where less than the survival threshold of staged text survived. */
  editLocus: string[];
  perSection: { name: string; survived: number }[];
}

export const computeEdit = (
  staged: LexicalDocument,
  published: LexicalDocument,
  locusThreshold = 0.7,
): EditReport => {
  const stagedWords = words(textOf(staged.root));
  const publishedWords = words(textOf(published.root));
  const editDistance = stagedWords.length
    ? Number((lcs(stagedWords, publishedWords) / stagedWords.length).toFixed(4))
    : 1;

  const stagedSections = sections(staged);
  const publishedByName = new Map(sections(published).map((s) => [s.name, s]));

  const perSection = stagedSections.map((s) => {
    const match = publishedByName.get(s.name);
    const survived = s.words.length && match ? Number((lcs(s.words, match.words) / s.words.length).toFixed(4)) : 0;
    return { name: s.name, survived };
  });

  return {
    editDistance,
    editLocus: perSection.filter((s) => s.survived < locusThreshold).map((s) => s.name),
    perSection,
  };
};

/** Count claim annotations that survived — a silent deletion during editing is what CNT09's re-check catches later, but the review record notices first. */
export const claimSurvival = (staged: LexicalDocument, published: LexicalDocument): { staged: number; published: number } => {
  const count = (doc: LexicalDocument) => {
    let n = 0;
    for (const { node } of walkDoc(doc.root)) if (node.type === 'claim') n += 1;
    return n;
  };
  return { staged: count(staged), published: count(published) };
};

function* walkDoc(node: SerializedLexicalNode): Generator<{ node: SerializedLexicalNode }> {
  for (const item of walk(node)) yield item;
}
