/**
 * Re-exports the provider-neutral document model.
 * Prefer importing from `@carinyaparc/content-store` in new code.
 */
export {
  claimNode,
  collectClaims,
  collectLinks,
  doc,
  heading,
  link,
  paragraph,
  textNode,
  textOf,
  textOutsideClaims,
  walk,
  type ClaimNode,
  type Document,
  type DocNode,
  type FoundClaim,
  type FoundLink,
  type TextNode,
} from '@carinyaparc/content-store';

/** @deprecated Use Document from @carinyaparc/content-store */
export type { Document as LexicalDocument, DocNode as SerializedLexicalNode, ClaimNode as SerializedClaimNode, TextNode as SerializedTextNode } from '@carinyaparc/content-store';
