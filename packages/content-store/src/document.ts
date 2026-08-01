/**
 * Provider-neutral rich document model and claim annotations.
 *
 * A claim is an inline element carrying a stable `claimId` bound to a pack
 * entry id:
 *
 *   { "type": "claim", "claimId": "c3",
 *     "children": [{ "type": "text", "text": "roughly 0.4% over four years" }] }
 *
 * Walkers and builders operate on serialized JSON. CMS adapters translate
 * to and from their editor formats at the boundary; gates never see a vendor.
 */

export interface TextNode {
  type: 'text';
  text: string;
  [k: string]: unknown;
}

export interface ClaimNode {
  type: 'claim';
  claimId: string;
  children: DocNode[];
  [k: string]: unknown;
}

export interface DocNode {
  type: string;
  children?: DocNode[];
  [k: string]: unknown;
}

export interface Document {
  root: DocNode;
}

export interface FoundClaim {
  claimId: string;
  text: string;
  path: string;
}

const isClaim = (n: DocNode): n is ClaimNode =>
  n.type === 'claim' && typeof (n as ClaimNode).claimId === 'string';

/** Depth-first walk over every node. */
export function* walk(node: DocNode, path = 'root'): Generator<{ node: DocNode; path: string }> {
  yield { node, path };
  const children = node.children ?? [];
  for (let i = 0; i < children.length; i += 1) {
    yield* walk(children[i], `${path}.${i}`);
  }
}

/** All text under a node, joined. Paragraph-level nodes are space-separated. */
export const textOf = (node: DocNode): string => {
  const parts: string[] = [];
  for (const { node: n } of walk(node)) {
    if (n.type === 'text' && typeof n.text === 'string') parts.push(n.text as string);
    if (n.type === 'linebreak' || n.type === 'paragraph' || n.type === 'heading') parts.push(' ');
  }
  return parts.join('').replace(/\s+/g, ' ').trim();
};

/** Every claim annotation in the document, with its rendered text. */
export const collectClaims = (doc: Document): FoundClaim[] => {
  const found: FoundClaim[] = [];
  for (const { node, path } of walk(doc.root)) {
    if (isClaim(node)) {
      found.push({ claimId: node.claimId, text: textOf(node), path });
    }
  }
  return found;
};

/**
 * Text of the document with annotated claim spans removed — what the
 * prohibition gate scans for unsourced regulated claims.
 */
export const textOutsideClaims = (doc: Document): string => {
  const clone = structuredClone(doc.root);
  const strip = (node: DocNode): void => {
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

/**
 * Every link in the document. Some editors store the URL under fields.url;
 * others use a top-level url property. Both are accepted.
 */
export const collectLinks = (doc: Document): FoundLink[] => {
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
export const claimNode = (claimId: string, text: string): ClaimNode => ({
  type: 'claim',
  claimId,
  children: [{ type: 'text', text, version: 1 } as TextNode],
  version: 1,
});

export const textNode = (text: string): TextNode => ({ type: 'text', text, version: 1 });

export const paragraph = (...children: DocNode[]): DocNode => ({
  type: 'paragraph',
  children,
  version: 1,
});

export const heading = (tag: 'h1' | 'h2' | 'h3', text: string): DocNode => ({
  type: 'heading',
  tag,
  children: [textNode(text)],
  version: 1,
});

export const link = (url: string, text: string): DocNode => ({
  type: 'link',
  fields: { url, linkType: 'custom' },
  children: [textNode(text)],
  version: 1,
});

export const doc = (...children: DocNode[]): Document => ({
  root: { type: 'root', children, version: 1, format: '', indent: 0, direction: null },
});
