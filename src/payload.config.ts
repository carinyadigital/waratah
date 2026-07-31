import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildConfig } from 'payload';
import { sqliteAdapter } from '@payloadcms/db-sqlite';
import { lexicalEditor } from '@payloadcms/richtext-lexical';

import { Users } from './collections/Users';
import { Posts, Recipes } from './collections/content';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET ?? 'carinya-dev-secret',
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URI ?? `file:${path.resolve(dirname, '../carinyaparc.db')}`,
    },
  }),
  editor: lexicalEditor(),
  collections: [Users, Posts, Recipes],
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
});
