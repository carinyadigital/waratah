/**
 * The Payload editor half of the claim annotation: a Lexical inline element
 * node carrying a stable `claimId`, registered as a server feature so staged
 * documents containing claim nodes round-trip through Payload's editor state.
 * The deterministic JSON contract the gates walk lives in
 * @carinyaparc/content-pipeline (src/lexical/claim.ts) and does not depend on
 * this file.
 *
 * A sibling `claims` array with character offsets was not needed: the
 * inline-feature API carries `claimId` as serialized node state.
 */
import { createNode, createServerFeature } from '@payloadcms/richtext-lexical';
import {
  ElementNode,
  type EditorConfig,
  type LexicalNode,
  type SerializedElementNode,
  type Spread,
} from '@payloadcms/richtext-lexical/lexical';

export type SerializedClaimNode = Spread<{ claimId: string }, SerializedElementNode>;

export class ClaimNode extends ElementNode {
  __claimId: string;

  constructor(claimId: string, key?: string) {
    super(key);
    this.__claimId = claimId;
  }

  static getType(): string {
    return 'claim';
  }

  static clone(node: ClaimNode): ClaimNode {
    return new ClaimNode(node.__claimId, node.__key);
  }

  static importJSON(serialized: SerializedClaimNode): ClaimNode {
    return new ClaimNode(serialized.claimId);
  }

  exportJSON(): SerializedClaimNode {
    return {
      ...super.exportJSON(),
      type: 'claim',
      claimId: this.__claimId,
      version: 1,
    };
  }

  getClaimId(): string {
    return this.getLatest().__claimId;
  }

  isInline(): boolean {
    return true;
  }

  canBeEmpty(): boolean {
    return false;
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const el = document.createElement('span');
    el.setAttribute('data-claim-id', this.__claimId);
    el.className = 'claim';
    return el;
  }

  updateDOM(): boolean {
    return false;
  }
}

export const $createClaimNode = (claimId: string): ClaimNode => new ClaimNode(claimId);

export const $isClaimNode = (node: LexicalNode | null | undefined): node is ClaimNode =>
  node instanceof ClaimNode;

export const ClaimFeature = createServerFeature({
  key: 'claim',
  feature: {
    nodes: [
      createNode({
        node: ClaimNode,
      }),
    ],
  },
});
