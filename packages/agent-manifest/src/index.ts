/** Manifest loading and types. The CLI in scripts/agents/cli.ts consumes these. */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse as parseYaml } from 'yaml';

const here = path.dirname(fileURLToPath(import.meta.url));

export type Write =
  | 'artifact-store'
  | 'tracker'
  | 'pr-comment'
  | 'chat'
  | 'repo-branch'
  | 'cms-draft'
  | 'cms-publish'
  | 'email-send'
  | 'social-post'
  | 'repo-main'
  | 'deploy';

export const CONSEQUENTIAL_WRITES: Write[] = [
  'cms-publish',
  'email-send',
  'social-post',
  'repo-main',
  'deploy',
];

export interface Trigger {
  type: 'schedule' | 'chat' | 'repo-event' | 'webhook' | 'manual';
  cron?: string;
  timezone?: string;
  channel?: string;
  event?: string;
  paths?: string[];
}

export interface Binding {
  provider: string;
  mode?: string;
  schedule?: string;
  timezone?: string;
  workflow?: string;
  harness?: 'none';
  spendCapAcknowledged?: boolean;
}

export interface Manifest {
  version: 2;
  name: string;
  team: string;
  owner: string;
  description: string;
  tags: string[];
  capability: {
    kind: 'conversational' | 'deterministic' | 'interactive';
    model?: 'strong' | 'standard' | 'none';
    workflow?: string;
  };
  policy: {
    untrustedInput: boolean;
    connections: string[];
    writes: Write[];
    approval: 'none' | 'draft-only' | 'pr-review' | 'human';
    spendCapUsd?: number;
    idempotencyKey?: string;
    cmsRole?: string;
  };
  extensions?: {
    content?: {
      nThreshold?: Record<string, number>;
      clusters?: string[];
      emits?: string[];
    };
    [k: string]: unknown;
  };
  bindings: Binding[];
  triggers?: Trigger[];
  observability: { traces: 'none' | 'platform' | 'otel' | 'both'; alertChannel: string; evals?: string };
}

export interface LoadedManifest {
  dir: string;
  file: string;
  manifest: Manifest;
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
const applyFormats = (addFormats as unknown as { default?: typeof addFormats }).default ?? addFormats;
applyFormats(ajv);
const schema = JSON.parse(readFileSync(path.join(here, '..', 'agent.schema.json'), 'utf8'));
export const validateManifest = ajv.compile(schema);

const contentExtSchema = JSON.parse(
  readFileSync(path.join(here, '..', 'extensions', 'content.schema.json'), 'utf8'),
);
export const validateContentExtension = ajv.compile(contentExtSchema);

/**
 * Discover agents. Supports flat `agents/<name>/agent.yaml` and nested
 * `agents/<team>/<name>/agent.yaml`. A directory is an agent iff it holds
 * an agent.yaml.
 */
export const loadManifests = (root: string): LoadedManifest[] => {
  const agentsDir = path.join(root, 'agents');
  if (!existsSync(agentsDir)) return [];

  const out: LoadedManifest[] = [];

  const visit = (dir: string, rel: string) => {
    const file = path.join(dir, 'agent.yaml');
    if (existsSync(file)) {
      out.push({
        dir: rel.replace(/\\/g, '/'),
        file,
        manifest: parseYaml(readFileSync(file, 'utf8')) as Manifest,
      });
      return;
    }
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      // Skip known team-shared directories that never hold an agent.
      if (['artifacts', 'ops', 'pipeline', 'schemas'].includes(entry.name)) continue;
      visit(path.join(dir, entry.name), rel ? `${rel}/${entry.name}` : entry.name);
    }
  };

  visit(agentsDir, '');
  return out;
};

export interface ConnectionEntry {
  kind: string;
  owner: string;
  rotation: unknown;
  provider?: string;
  assertion?: { repo: string; testPath: string; commitSha: string };
}

export interface ConnectionRegistry {
  connections: Record<string, ConnectionEntry>;
}

export const loadConnections = (root: string): ConnectionRegistry => {
  const file = path.join(root, 'config', 'connections.yaml');
  return parseYaml(readFileSync(file, 'utf8')) as ConnectionRegistry;
};
