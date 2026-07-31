import type { CollectionConfig } from 'payload';

/**
 * The agent identity is a Payload user.
 *
 * `useAPIKey: true` gives the agent an API key to authenticate REST calls.
 * Two properties follow free: provenance — version history attributes every
 * staged draft to this identity — and revocation — rotating or disabling one
 * key stops the agent, touching nothing else.
 */
const isAdmin = ({ req }: { req: { user?: unknown } }): boolean =>
  (req.user as { role?: string } | null | undefined)?.role === 'admin';

export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    useAPIKey: true,
  },
  admin: {
    useAsTitle: 'email',
  },
  access: {
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
    read: ({ req }) => Boolean(req.user),
  },
  fields: [
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'editor',
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Editor', value: 'editor' },
        // The role content agents authenticate as. Can stage drafts, cannot
        // publish — see src/access/agentCannotPublish.ts.
        { label: 'Agent', value: 'agent' },
      ],
      access: {
        // Only admins may change roles; nobody escalates themselves.
        update: ({ req }) => (req.user as { role?: string } | null)?.role === 'admin',
      },
    },
  ],
};
