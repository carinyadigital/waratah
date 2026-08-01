/**
 * Discover installed runtime adapters from packages/runtime/adapters/<id>/adapter.json.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type SpendCapCapability = 'enforced' | 'acknowledged' | 'none';

export interface AdapterManifest {
  id: string;
  description: string;
  modes: string[];
  capabilities: {
    spendCap: SpendCapCapability;
    schedule: boolean;
    secretsIsolation: boolean;
  };
  options: Record<string, unknown>;
}

const adaptersRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'adapters');

export const loadAdapters = (root?: string): AdapterManifest[] => {
  const dir = root ? path.join(root, 'packages', 'runtime', 'adapters') : adaptersRoot;
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const file = path.join(dir, d.name, 'adapter.json');
      if (!existsSync(file)) return null;
      return JSON.parse(readFileSync(file, 'utf8')) as AdapterManifest;
    })
    .filter((a): a is AdapterManifest => a !== null);
};

export const adapterIds = (root?: string): string[] => loadAdapters(root).map((a) => a.id);
