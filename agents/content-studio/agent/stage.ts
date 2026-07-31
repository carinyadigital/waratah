/**
 * Payload REST staging as the agent identity.
 *
 * Always `draft=true`, always `_status: "draft"`. Idempotent on brief.slug:
 * an existing draft for the slug is PATCHed, never duplicated. The agent's
 * key cannot publish regardless, but this client does not even ask.
 */
import type { DraftArtifact } from '../../../packages/content-pipeline/src/gates/types';

export interface StageConfig {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export interface StageResult {
  id: string | number;
  operation: 'created' | 'updated';
  url: string;
}

const collectionFor = (draft: DraftArtifact): 'posts' | 'recipes' =>
  draft.collection ?? (draft.surface === 'recipes' ? 'recipes' : 'posts');

const headers = (apiKey: string) => ({
  Authorization: `users API-Key ${apiKey}`,
  'Content-Type': 'application/json',
});

export const stageDraft = async (draft: DraftArtifact, config: StageConfig): Promise<StageResult> => {
  const f = config.fetchImpl ?? fetch;
  const collection = collectionFor(draft);
  const base = config.baseUrl.replace(/\/$/, '');

  // Idempotency: find an existing document for this slug first.
  const findRes = await f(
    `${base}/api/${collection}?where[slug][equals]=${encodeURIComponent(draft.slug)}&draft=true&limit=1`,
    { headers: headers(config.apiKey) },
  );
  if (!findRes.ok) throw new Error(`find failed: ${findRes.status}`);
  const found = (await findRes.json()) as { docs: { id: string | number }[] };

  const body = JSON.stringify({
    title: draft.title,
    slug: draft.slug,
    _status: 'draft',
    content: draft.content,
  });

  if (found.docs.length) {
    const id = found.docs[0].id;
    // PATCH must not carry title/slug — they are locked fields for the agent
    // role; sending them is not an error (they are stripped) but staying
    // inside the role's envelope is the polite version of the guarantee.
    const patchBody = JSON.stringify({ _status: 'draft', content: draft.content });
    const res = await f(`${base}/api/${collection}/${id}?draft=true`, {
      method: 'PATCH',
      headers: headers(config.apiKey),
      body: patchBody,
    });
    if (!res.ok) throw new Error(`update failed: ${res.status}`);
    return { id, operation: 'updated', url: `${base}/admin/collections/${collection}/${id}` };
  }

  const res = await f(`${base}/api/${collection}?draft=true`, {
    method: 'POST',
    headers: headers(config.apiKey),
    body,
  });
  if (!res.ok) throw new Error(`create failed: ${res.status}`);
  const created = (await res.json()) as { doc: { id: string | number } };
  return {
    id: created.doc.id,
    operation: 'created',
    url: `${base}/admin/collections/${collection}/${created.doc.id}`,
  };
};
