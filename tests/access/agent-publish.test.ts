/**
 * CNT01-06 / CNT01-08 — integration tests for the publishing guardrails.
 *
 * These run against Payload's Local API with `overrideAccess: false`, which
 * evaluates exactly the same server-side access functions as every HTTP
 * surface (REST, GraphQL). The acceptance criterion is that denial happens
 * server-side regardless of API surface — this is that assertion. The REST
 * staging call itself is documented in docs/agent-publishing.md.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Payload } from 'payload';

const dbDir = mkdtempSync(path.join(tmpdir(), 'carinya-test-'));
process.env.DATABASE_URI = `file:${path.join(dbDir, 'test.db')}`;
process.env.PAYLOAD_SECRET = 'test-secret';

type TestUser = { id: string | number; email: string; role: string; collection: 'users' };

let payload: Payload;
let admin: TestUser;
let agent: TestUser;

const asUser = (doc: { id: string | number; email: string }, role: string): TestUser => ({
  id: doc.id,
  email: doc.email,
  role,
  collection: 'users',
});

beforeAll(async () => {
  const { getPayload } = await import('payload');
  const { default: config } = await import('../../src/payload.config');
  payload = await getPayload({ config });

  const adminDoc = await payload.create({
    collection: 'users',
    data: { email: 'human@carinyaparc.com.au', password: 'test-password-1', role: 'admin' },
  });
  const agentDoc = await payload.create({
    collection: 'users',
    data: { email: 'content-studio@agents.carinyaparc.com.au', password: 'test-password-2', role: 'agent' },
  });
  admin = asUser(adminDoc, 'admin');
  agent = asUser(agentDoc, 'agent');
});

afterAll(async () => {
  await payload?.destroy?.();
});

describe('CNT01-S1 — the agent identity exists and can stage', () => {
  it('agent user exists with role "agent" and an API key surface', async () => {
    const doc = await payload.findByID({ collection: 'users', id: agent.id });
    expect(doc.role).toBe('agent');
    // useAPIKey: true injects enableAPIKey/apiKey onto the auth collection.
    expect('enableAPIKey' in doc).toBe(true);
  });

  it('agent can create a draft, and version history attributes it to the agent identity', async () => {
    const doc = await payload.create({
      collection: 'posts',
      draft: true,
      data: { title: 'Soil carbon, measured', slug: 'soil-carbon-measured', _status: 'draft' },
      user: agent,
      overrideAccess: false,
    });
    expect(doc.id).toBeDefined();
    expect(doc._status).toBe('draft');

    const versions = await payload.findVersions({
      collection: 'posts',
      where: { parent: { equals: doc.id } },
    });
    expect(versions.docs.length).toBeGreaterThan(0);
    const attributed = versions.docs[0].version.updatedBy;
    const attributedId = typeof attributed === 'object' && attributed !== null ? attributed.id : attributed;
    expect(attributedId).toBe(agent.id);
  });
});

describe('CNT01-S2 — the agent cannot publish', () => {
  it('agent staging succeeds, publishing is denied server-side', async () => {
    const doc = await payload.create({
      collection: 'posts',
      draft: true,
      data: { title: 'Riparian planting notes', slug: 'riparian-planting-notes', _status: 'draft' },
      user: agent,
      overrideAccess: false,
    });

    await expect(
      payload.update({
        collection: 'posts',
        id: doc.id,
        data: { _status: 'published' },
        user: agent,
        overrideAccess: false,
      }),
    ).rejects.toThrow();
  });

  it('agent cannot create a document that is born published', async () => {
    await expect(
      payload.create({
        collection: 'posts',
        data: { title: 'Sneaky', slug: 'sneaky-born-published', _status: 'published' },
        user: agent,
        overrideAccess: false,
      }),
    ).rejects.toThrow();
  });

  it('a human (admin) can publish the same draft', async () => {
    const doc = await payload.create({
      collection: 'posts',
      draft: true,
      data: { title: 'Publishable', slug: 'publishable-by-human', _status: 'draft' },
      user: agent,
      overrideAccess: false,
    });
    const published = await payload.update({
      collection: 'posts',
      id: doc.id,
      data: { _status: 'published' },
      user: admin,
      overrideAccess: false,
    });
    expect(published._status).toBe('published');
  });

  it('agent cannot touch a published document at all (query constraint)', async () => {
    const doc = await payload.create({
      collection: 'posts',
      draft: true,
      data: { title: 'Live piece', slug: 'live-piece', _status: 'draft' },
      user: admin,
      overrideAccess: false,
    });
    await payload.update({
      collection: 'posts',
      id: doc.id,
      data: { _status: 'published' },
      user: admin,
      overrideAccess: false,
    });

    await expect(
      payload.update({
        collection: 'posts',
        id: doc.id,
        data: { content: null },
        user: agent,
        overrideAccess: false,
      }),
    ).rejects.toThrow();
  });

  it('the same denial holds on recipes', async () => {
    const doc = await payload.create({
      collection: 'recipes',
      draft: true,
      data: { title: 'Slow-roasted beef', slug: 'slow-roasted-beef', _status: 'draft' },
      user: agent,
      overrideAccess: false,
    });
    await expect(
      payload.update({
        collection: 'recipes',
        id: doc.id,
        data: { _status: 'published' },
        user: agent,
        overrideAccess: false,
      }),
    ).rejects.toThrow();
  });
});

describe('CNT01-S3 — the join key and URL are locked (partial-update semantics)', () => {
  it('locked fields are denied while the rest of the update proceeds', async () => {
    const doc = await payload.create({
      collection: 'posts',
      draft: true,
      data: { title: 'Original title', slug: 'original-slug', _status: 'draft' },
      user: agent,
      overrideAccess: false,
    });

    const updated = await payload.update({
      collection: 'posts',
      id: doc.id,
      draft: true,
      data: { title: 'Agent tried to change this', slug: 'agent-moved-the-url' },
      user: agent,
      overrideAccess: false,
    });

    // Field-level access returns a boolean; a denied field is stripped from
    // the incoming update while the document update itself proceeds.
    expect(updated.title).toBe('Original title');
    expect(updated.slug).toBe('original-slug');

    const humanUpdated = await payload.update({
      collection: 'posts',
      id: doc.id,
      draft: true,
      data: { title: 'Editor renamed it' },
      user: admin,
      overrideAccess: false,
    });
    expect(humanUpdated.title).toBe('Editor renamed it');
  });
});
