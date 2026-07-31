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
 * `versions: { drafts: true }` injects `_status`, which is the hinge the
 * whole publish denial swings on.
 *
 * Collection-level access wires in `agentCannotPublish`. Field-level locks
 * on `title` and `slug` — the join key and the public URL are not the
 * agent's to change.
 *
 * `updatedBy` is populated server-side from the authenticated user on every
 * save, so Payload version history attributes every staged draft to the
 * agent identity.
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
      description: 'Join key across tracker, artifacts and CMS. Canonical.',
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
  {
    // Per-surface decay half-life sweep reads this. Human-set at review;
    // locked to the agent role like every editorial judgement.
    name: 'lastReviewedAt',
    type: 'date',
    access: {
      update: lockedForAgent,
    },
    admin: {
      description: 'Set when a human re-reviews the live page. content-monitor flags pages past their surface half-life.',
    },
  },
  {
    // The positioning hash the piece was written under. content-monitor
    // compares it against the current hash.
    name: 'positioningHash',
    type: 'text',
    admin: {
      description: 'sha256 of positioning.md at write time. Recorded by the studio at staging.',
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
