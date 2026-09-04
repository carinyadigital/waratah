import { mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

import type { WaratahManifest } from '../shared/contracts.js';

/** Atomically replaces a manifest without exposing partially written JSON. */
export async function writeManifest(manifest: WaratahManifest, destination: string): Promise<void> {
  const directory = dirname(destination);
  const temporaryPath = join(directory, `.manifest-${process.pid}-${randomUUID()}.tmp`);
  await mkdir(directory, { recursive: true });

  try {
    const handle = await open(temporaryPath, 'wx', 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(manifest, undefined, 2)}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, destination);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
