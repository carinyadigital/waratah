/**
 * Pass 2, claim anchoring.
 *
 * The writer works in marked text: `[[c3:the claimed text]]` binds a span to
 * pack entry c3. This module converts marked paragraphs into Lexical JSON
 * with real claim nodes, and refuses markers that reference no pack entry —
 * anchoring to a nonexistent source is exactly the failure the gate exists
 * to catch, so it is refused at emission too.
 */
import {
  claimNode,
  doc,
  heading,
  link,
  paragraph,
  textNode,
  type LexicalDocument,
  type SerializedLexicalNode,
} from '../../../packages/content-pipeline/src/lexical/claim';
import type { PackArtifact } from '../../../packages/content-pipeline/src/gates/types';

const MARKER = /\[\[(c[0-9]+):((?:[^\]]|\](?!\]))+)\]\]/g;
const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

export class UnknownClaimIdError extends Error {
  constructor(public claimId: string) {
    super(`claim marker references unknown pack entry "${claimId}"`);
  }
}

/** Convert one marked paragraph into Lexical children. Links in markdown form are converted too. */
export const anchorParagraph = (marked: string, pack: PackArtifact): SerializedLexicalNode[] => {
  const known = new Set(pack.entries.map((e) => e.id));
  const nodes: SerializedLexicalNode[] = [];

  // First split on claim markers, then handle links inside plain segments.
  let last = 0;
  const pushPlain = (segment: string) => {
    let l = 0;
    for (const m of segment.matchAll(LINK)) {
      if (m.index! > l) nodes.push(textNode(segment.slice(l, m.index!)));
      nodes.push(link(m[2], m[1]));
      l = m.index! + m[0].length;
    }
    if (l < segment.length) nodes.push(textNode(segment.slice(l)));
  };

  for (const m of marked.matchAll(MARKER)) {
    if (m.index! > last) pushPlain(marked.slice(last, m.index!));
    const [, claimId, text] = m;
    if (!known.has(claimId)) throw new UnknownClaimIdError(claimId);
    nodes.push(claimNode(claimId, text));
    last = m.index! + m[0].length;
  }
  if (last < marked.length) pushPlain(marked.slice(last));
  return nodes;
};

export interface MarkedSection {
  heading?: { tag: 'h2' | 'h3'; text: string };
  paragraphs: string[];
}

/** Assemble a whole document from marked sections. */
export const anchorDocument = (sections: MarkedSection[], pack: PackArtifact): LexicalDocument => {
  const children: SerializedLexicalNode[] = [];
  for (const section of sections) {
    if (section.heading) children.push(heading(section.heading.tag, section.heading.text));
    for (const p of section.paragraphs) children.push(paragraph(...anchorParagraph(p, pack)));
  }
  return doc(...children);
};
