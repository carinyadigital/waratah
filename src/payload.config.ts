import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildConfig } from 'payload';
import { sqliteAdapter } from '@payloadcms/db-sqlite';
import { lexicalEditor } from '@payloadcms/richtext-lexical';

import { ClaimFeature } from './lexical/claimFeature';
import { Users } from './collections/Users';
import { Posts, Recipes } from './collections/content';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const payloadSecret = (): string => {
  if (process.env.PAYLOAD_SECRET) return process.env.PAYLOAD_SECRET;
  // Production must set the secret — a hardcoded fallback is only for local/dev and tests.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('PAYLOAD_SECRET is required when NODE_ENV=production');
  }
  return 'carinya-dev-secret';
};

export default buildConfig({
  secret: payloadSecret(),
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URI ?? `file:${path.resolve(dirname, '../carinyaparc.db')}`,
    },
  }),
  editor: lexicalEditor({
    features: ({ defaultFeatures }) => [...defaultFeatures, ClaimFeature()],
  }),
  collections: [Users, Posts, Recipes],
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
});
