/**
 * The publish-denial guarantee, checked continuously.
 *
 * This test fails if the access function is removed, renamed, unwired or
 * weakened. It asserts three layers, cheapest first:
 *
 *  1. Wiring — posts and recipes both use `agentCannotPublish` as their
 *     collection-level update access, and lock title/slug at field level.
 *  2. Semantics — the function denies `_status: "published"` for the agent
 *     role and constrains the agent to non-published targets.
 *  3. Behaviour — the full Payload integration suite in
 *     agent-publish.test.ts exercises the same rules against a live config.
 *
 * Wired into content-qa.yml: a regression here fails the workflow on the PR
 * and again on the merge commit.
 */
import { describe, expect, it } from 'vitest';
import {
  agentCannotDelete,
  agentCannotPublish,
  agentCreatesDraftsOnly,
  lockedForAgent,
  publicReadsPublished,
} from '../../src/access/agentCannotPublish';
import { Posts, Recipes } from '../../src/collections/content';

const agentReq = { req: { user: { id: 1, role: 'agent' } } } as never;
const editorReq = { req: { user: { id: 2, role: 'editor' } } } as never;
const anonReq = { req: { user: null } } as never;

describe('wiring — the access rules exist and are attached', () => {
  it.each([
    ['posts', Posts],
    ['recipes', Recipes],
  ])('%s uses agentCannotPublish for update and locks title/slug for the agent', (_name, collection) => {
    expect(collection.access?.read).toBe(publicReadsPublished);
    expect(collection.access?.update).toBe(agentCannotPublish);
    expect(collection.access?.create).toBe(agentCreatesDraftsOnly);
    expect(collection.access?.delete).toBe(agentCannotDelete);
    expect(collection.versions).toMatchObject({ drafts: true });

    const title = collection.fields.find((f) => 'name' in f && f.name === 'title');
    const slug = collection.fields.find((f) => 'name' in f && f.name === 'slug');
    expect(title && 'access' in title && title.access?.update).toBe(lockedForAgent);
    expect(slug && 'access' in slug && slug.access?.update).toBe(lockedForAgent);
  });
});

describe('public read cannot see drafts', () => {
  it('anonymous read is constrained to published documents', () => {
    expect(publicReadsPublished(anonReq)).toEqual({ _status: { equals: 'published' } });
  });

  it('authenticated readers are unconstrained', () => {
    expect(publicReadsPublished(agentReq)).toBe(true);
    expect(publicReadsPublished(editorReq)).toBe(true);
  });
});

describe('semantics — the function cannot be quietly weakened', () => {
  it('denies the agent any update that sets _status published', () => {
    expect(agentCannotPublish({ ...(agentReq as object), data: { _status: 'published' } } as never)).toBe(false);
  });

  it('constrains the agent to non-published documents otherwise', () => {
    const result = agentCannotPublish({ ...(agentReq as object), data: { content: null } } as never);
    expect(result).toEqual({ _status: { not_equals: 'published' } });
  });

  it('denies the agent creating a document born published', () => {
    expect(agentCreatesDraftsOnly({ ...(agentReq as object), data: { _status: 'published' } } as never)).toBe(false);
  });

  it('denies unauthenticated access entirely', () => {
    expect(agentCannotPublish(anonReq)).toBe(false);
    expect(agentCreatesDraftsOnly(anonReq)).toBe(false);
  });

  it('does not constrain humans', () => {
    expect(agentCannotPublish({ ...(editorReq as object), data: { _status: 'published' } } as never)).toBe(true);
    expect(lockedForAgent(editorReq)).toBe(true);
    expect(lockedForAgent(agentReq)).toBe(false);
  });
});
