/**
 * Stage a draft into the CMS via the content-store port.
 *
 * Provider details live in @carinyaparc/content-store-payload; this module
 * only constructs the store from env and forwards the call.
 */
import type { DraftArtifact } from '@carinyaparc/content-pipeline';
import { createPayloadStore } from '@carinyaparc/content-store-payload';
import type { AccessAssertionPin, StagedDraft } from '@carinyaparc/content-store';

export interface StageConfig {
  baseUrl: string;
  apiKey: string;
  positioningHash?: string;
  fetchImpl?: typeof fetch;
  assertion?: AccessAssertionPin;
}

export type StageResult = StagedDraft;

export const stageDraft = async (draft: DraftArtifact, config: StageConfig): Promise<StageResult> => {
  const store = createPayloadStore({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    fetchImpl: config.fetchImpl,
    assertion: config.assertion,
  });
  return store.stageDraft({
    slug: draft.slug,
    title: draft.title,
    surface: draft.surface,
    content: draft.content,
    positioningHash: config.positioningHash,
  });
};
