import type { CollectionConfig, Field } from 'payload';
import {
  agentCannotDelete,
  agentCannotPublish,
  agentCreatesDraftsOnly,
  lockedForAgent,
} from '../access/agentCannotPublish';

/**
 * Shared shape for the content collections (`posts`, `recipes`).
 *
 * CNT01-02: `versions: { drafts: true }` injects `_status`, which is the
 * hinge the whole publish denial swings on (design.md §6.2).
 *
 * CNT01-05: collection-level access wires in `agentCannotPublish`.
 * CNT01-07: field-level locks on `title` and `slug` — the join key and the
 * public URL are not the agent's to change.
 *
 * `updatedBy` is populated server-side from the authenticated user on every
 * save, so Payload version history attributes every staged draft to the
 * agent identity (CNT01-S1 acceptance criterion).
 */
const contentFields = (extra: Field[] = []): Field[] => [
  {
    name: 'title',
    type: 'text',
    required: true,
    access: {
      update: lockedForAgent,
    },
  },
  {
    name: 'slug',
    type: 'text',
    required: true,
    unique: true,
    index: true,
    admin: {
      description: 'Join key across tracker, artifacts and CMS. Canonical. (design.md §4)',
    },
    access: {
      update: lockedForAgent,
    },
  },
  {
    name: 'content',
    type: 'richText',
  },
  {
    name: 'updatedBy',
    type: 'relationship',
    relationTo: 'users',
    admin: {
      hidden: true,
      readOnly: true,
    },
  },
  ...extra,
];

const contentCollection = (slug: 'posts' | 'recipes', extra: Field[] = []): CollectionConfig => ({
  slug,
  versions: {
    drafts: true,
  },
  admin: {
    useAsTitle: 'title',
  },
  access: {
    read: () => true,
    create: agentCreatesDraftsOnly,
    update: agentCannotPublish,
    delete: agentCannotDelete,
  },
  hooks: {
    beforeChange: [
      ({ req, data }) => ({
        ...data,
        // Attribution is set server-side from the authenticated identity —
        // no marker field for a client to forge or forget.
        updatedBy: (req.user as { id?: string | number } | null)?.id ?? data?.updatedBy,
      }),
    ],
  },
  fields: contentFields(extra),
});

export const Posts = contentCollection('posts');

export const Recipes = contentCollection('recipes');
