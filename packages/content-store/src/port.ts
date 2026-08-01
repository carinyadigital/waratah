import type { Document } from './document';

export type ContentSurface = 'blog' | 'recipes' | 'landing' | 'newsletter';

export interface StageDraftInput {
  slug: string;
  title: string;
  surface: ContentSurface;
  content: Document;
  positioningHash?: string;
}

export interface StagedDraft {
  id: string | number;
  operation: 'created' | 'updated';
  url: string;
  collection: string;
}

export interface StoredDoc {
  id: string | number;
  slug: string;
  title: string;
  collection: string;
  content: Document;
  positioningHash?: string;
  lastReviewedAt?: string;
  publishedAt?: string;
  status?: 'draft' | 'published';
}

/**
 * Cross-repo pin for the publish-denial assertion. CI verifies the named
 * test still exists at the pinned commit in the site repository.
 */
export interface AccessAssertionPin {
  repo: string;
  testPath: string;
  commitSha: string;
}

export interface ContentStoreCapabilities {
  /** Whether this adapter can pin a publish-denial access assertion. */
  assertable: boolean;
  collections: string[];
  draftStaging: boolean;
  assertion?: AccessAssertionPin;
}

export interface ContentStore {
  stageDraft(input: StageDraftInput): Promise<StagedDraft>;
  findBySlug(slug: string, opts?: { draft?: boolean }): Promise<StoredDoc | null>;
  listPublished(opts?: { collections?: string[] }): Promise<StoredDoc[]>;
  capabilities(): ContentStoreCapabilities;
}
