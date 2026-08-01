/**
 * Payload CMS adapter — REST only, no Payload SDK.
 *
 * Always stages with draft=true and _status: "draft". Idempotent on slug:
 * an existing draft is PATCHed, never duplicated. The agent's API key cannot
 * publish; this client does not ask.
 */
import type {
  AccessAssertionPin,
  ContentStore,
  ContentStoreCapabilities,
  ContentSurface,
  Document,
  StageDraftInput,
  StagedDraft,
  StoredDoc,
} from '@carinyaparc/content-store';

export interface PayloadStoreConfig {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  /** Collections the agent may stage into / read from. */
  collections?: string[];
  /** Cross-repo pin for the publish-denial test in the site repository. */
  assertion?: AccessAssertionPin;
}

const DEFAULT_COLLECTIONS = ['posts', 'recipes'];

const collectionFor = (surface: ContentSurface, collections: string[]): string => {
  switch (surface) {
    case 'blog':
      if (!collections.includes('posts')) throw new Error('posts collection is not configured');
      return 'posts';
    case 'recipes':
      if (!collections.includes('recipes')) throw new Error('recipes collection is not configured');
      return 'recipes';
    case 'landing':
    case 'newsletter':
      throw new Error(
        `surface "${surface}" has no CMS collection to stage into — map it in the adapter or stage a different surface`,
      );
  }
};

const headers = (apiKey: string) => ({
  Authorization: `users API-Key ${apiKey}`,
  'Content-Type': 'application/json',
});

const asDocument = (value: unknown): Document => {
  if (value && typeof value === 'object' && 'root' in (value as object)) {
    return value as Document;
  }
  return { root: { type: 'root', children: [], version: 1 } };
};

const toStored = (collection: string, d: Record<string, unknown>): StoredDoc => ({
  id: d.id as string | number,
  slug: d.slug as string,
  title: (d.title as string) ?? '',
  collection,
  content: asDocument(d.content),
  positioningHash: d.positioningHash as string | undefined,
  lastReviewedAt: d.lastReviewedAt as string | undefined,
  publishedAt: (d.publishedAt ?? d.updatedAt) as string | undefined,
  status: d._status === 'published' ? 'published' : 'draft',
});

export class PayloadContentStore implements ContentStore {
  private readonly base: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly collections: string[];
  private readonly assertion?: AccessAssertionPin;

  constructor(config: PayloadStoreConfig) {
    this.base = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.collections = config.collections ?? DEFAULT_COLLECTIONS;
    this.assertion = config.assertion;
  }

  capabilities(): ContentStoreCapabilities {
    return {
      assertable: Boolean(this.assertion?.repo && this.assertion.testPath && this.assertion.commitSha),
      collections: [...this.collections],
      draftStaging: true,
      assertion: this.assertion,
    };
  }

  async stageDraft(input: StageDraftInput): Promise<StagedDraft> {
    const collection = collectionFor(input.surface, this.collections);
    const f = this.fetchImpl;

    const findRes = await f(
      `${this.base}/api/${collection}?where[slug][equals]=${encodeURIComponent(input.slug)}&draft=true&limit=1`,
      { headers: headers(this.apiKey) },
    );
    if (!findRes.ok) throw new Error(`find failed: ${findRes.status}`);
    const found = (await findRes.json()) as { docs: { id: string | number }[] };

    if (found.docs.length) {
      const id = found.docs[0].id;
      // PATCH must not carry title/slug — they are locked for the agent role.
      const patchBody = JSON.stringify({
        _status: 'draft',
        content: input.content,
        ...(input.positioningHash ? { positioningHash: input.positioningHash } : {}),
      });
      const res = await f(`${this.base}/api/${collection}/${id}?draft=true`, {
        method: 'PATCH',
        headers: headers(this.apiKey),
        body: patchBody,
      });
      if (!res.ok) throw new Error(`update failed: ${res.status}`);
      return {
        id,
        operation: 'updated',
        url: `${this.base}/admin/collections/${collection}/${id}`,
        collection,
      };
    }

    const body = JSON.stringify({
      title: input.title,
      slug: input.slug,
      _status: 'draft',
      content: input.content,
      ...(input.positioningHash ? { positioningHash: input.positioningHash } : {}),
    });
    const res = await f(`${this.base}/api/${collection}?draft=true`, {
      method: 'POST',
      headers: headers(this.apiKey),
      body,
    });
    if (!res.ok) throw new Error(`create failed: ${res.status}`);
    const created = (await res.json()) as { doc: { id: string | number } };
    return {
      id: created.doc.id,
      operation: 'created',
      url: `${this.base}/admin/collections/${collection}/${created.doc.id}`,
      collection,
    };
  }

  async findBySlug(slug: string, opts?: { draft?: boolean }): Promise<StoredDoc | null> {
    const draft = opts?.draft ?? false;
    for (const collection of this.collections) {
      const qs = new URLSearchParams({
        'where[slug][equals]': slug,
        limit: '1',
      });
      if (draft) qs.set('draft', 'true');
      const res = await this.fetchImpl(`${this.base}/api/${collection}?${qs}`, {
        headers: headers(this.apiKey),
      });
      if (!res.ok) throw new Error(`findBySlug failed: ${res.status}`);
      const body = (await res.json()) as { docs: Record<string, unknown>[] };
      if (body.docs[0]) return toStored(collection, body.docs[0]);
    }
    return null;
  }

  async listPublished(opts?: { collections?: string[] }): Promise<StoredDoc[]> {
    const collections = opts?.collections ?? this.collections;
    const docs: StoredDoc[] = [];
    for (const collection of collections) {
      let page = 1;
      for (;;) {
        if (page > 500) throw new Error(`listPublished ${collection}: exceeded 500 pages`);
        const res = await this.fetchImpl(
          `${this.base}/api/${collection}?where[_status][equals]=published&limit=100&page=${page}`,
          { headers: headers(this.apiKey) },
        );
        if (!res.ok) throw new Error(`listPublished ${collection}: ${res.status}`);
        const body = (await res.json()) as {
          docs: Record<string, unknown>[];
          hasNextPage?: boolean;
          totalPages?: number;
        };
        for (const d of body.docs) docs.push(toStored(collection, d));
        if (body.docs.length === 0) break;
        if (body.hasNextPage === true) {
          page += 1;
          continue;
        }
        if (typeof body.totalPages === 'number' && page < body.totalPages) {
          page += 1;
          continue;
        }
        if (body.docs.length < 100) break;
        page += 1;
      }
    }
    return docs;
  }
}

export const createPayloadStore = (config: PayloadStoreConfig): ContentStore =>
  new PayloadContentStore(config);
