/**
 * CNT02-07 — the claim annotation contract. (design.md §5.1)
 *
 * A claim is a Lexical inline element node carrying a stable `claimId` bound
 * to a pack entry id:
 *
 *   { "type": "claim", "claimId": "c3",
 *     "children": [{ "type": "text", "text": "roughly 0.4% over four years" }] }
 *
 * This module is the deterministic half: builders and walkers over serialized
 * editor JSON, used by the claim-coverage gate, the prohibition gate and the
 * writer's pass 2. The Payload editor feature that registers the node lives
 * in the site (src/lexical/claimFeature.ts) — the gates never need it.
 */

export interface SerializedTextNode {
  type: 'text';
  text: string;
  [k: string]: unknown;
}

export interface SerializedClaimNode {
  type: 'claim';
  claimId: string;
  children: SerializedLexicalNode[];
  [k: string]: unknown;
}

export interface SerializedLexicalNode {
  type: string;
  children?: SerializedLexicalNode[];
  [k: string]: unknown;
}

export interface LexicalDocument {
  root: SerializedLexicalNode;
}

export interface FoundClaim {
  claimId: string;
  text: string;
  path: string;
}

const isClaim = (n: SerializedLexicalNode): n is SerializedClaimNode =>
  n.type === 'claim' && typeof (n as SerializedClaimNode).claimId === 'string';

/** Depth-first walk over every node. */
export function* walk(
  node: SerializedLexicalNode,
  path = 'root',
): Generator<{ node: SerializedLexicalNode; path: string }> {
  yield { node, path };
  const children = node.children ?? [];
  for (let i = 0; i < children.length; i += 1) {
    yield* walk(children[i], `${path}.${i}`);
  }
}

/** All text under a node, joined. Paragraph-level nodes are space-separated. */
export const textOf = (node: SerializedLexicalNode): string => {
  const parts: string[] = [];
  for (const { node: n } of walk(node)) {
    if (n.type === 'text' && typeof n.text === 'string') parts.push(n.text as string);
    if (n.type === 'linebreak' || n.type === 'paragraph' || n.type === 'heading') parts.push(' ');
  }
  return parts.join('').replace(/\s+/g, ' ').trim();
};

/** Every claim annotation in the document, with its rendered text. */
export const collectClaims = (doc: LexicalDocument): FoundClaim[] => {
  const found: FoundClaim[] = [];
  for (const { node, path } of walk(doc.root)) {
    if (isClaim(node)) {
      found.push({ claimId: node.claimId, text: textOf(node), path });
    }
  }
  return found;
};

/** Text of the document with annotated claim spans removed — what the prohibition gate scans for unsourced regulated claims. */
export const textOutsideClaims = (doc: LexicalDocument): string => {
  const clone = structuredClone(doc.root);
  const strip = (node: SerializedLexicalNode): void => {
    if (!node.children) return;
    node.children = node.children.filter((c) => !isClaim(c));
    node.children.forEach(strip);
  };
  strip(clone);
  return textOf(clone);
};

export interface FoundLink {
  url: string;
  text: string;
}

/** Every link in the document. Payload's link feature stores the URL under fields.url. */
export const collectLinks = (doc: LexicalDocument): FoundLink[] => {
  const links: FoundLink[] = [];
  for (const { node } of walk(doc.root)) {
    if (node.type === 'link' || node.type === 'autolink') {
      const fields = (node.fields ?? {}) as { url?: string };
      const url = fields.url ?? (node.url as string | undefined);
      if (url) links.push({ url, text: textOf(node) });
    }
  }
  return links;
};

/** Builder used by the writer's pass 2 and by tests. */
export const claimNode = (claimId: string, text: string): SerializedClaimNode => ({
  type: 'claim',
  claimId,
  children: [{ type: 'text', text, version: 1 } as SerializedTextNode],
  version: 1,
});

export const textNode = (text: string): SerializedTextNode => ({ type: 'text', text, version: 1 });

export const paragraph = (...children: SerializedLexicalNode[]): SerializedLexicalNode => ({
  type: 'paragraph',
  children,
  version: 1,
});

export const heading = (tag: 'h1' | 'h2' | 'h3', text: string): SerializedLexicalNode => ({
  type: 'heading',
  tag,
  children: [textNode(text)],
  version: 1,
});

export const link = (url: string, text: string): SerializedLexicalNode => ({
  type: 'link',
  fields: { url, linkType: 'custom' },
  children: [textNode(text)],
  version: 1,
});

export const doc = (...children: SerializedLexicalNode[]): LexicalDocument => ({
  root: { type: 'root', children, version: 1, format: '', indent: 0, direction: null },
});
