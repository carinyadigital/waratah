/** Manifest loading and types. The CLI in scripts/agents/cli.ts consumes these. */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse as parseYaml } from 'yaml';

const here = path.dirname(fileURLToPath(import.meta.url));

export type Platform =
  | 'claude-managed-agent'
  | 'vercel-eve'
  | 'vercel-next-mounted'
  | 'github-actions'
  | 'claude-subagent';

export type Write =
  | 'artifact-store'
  | 'tracker'
  | 'pr-comment'
  | 'slack'
  | 'repo-branch'
  | 'cms-draft'
  | 'cms-publish'
  | 'email-send'
  | 'social-post'
  | 'repo-main'
  | 'vercel-deploy';

export const CONSEQUENTIAL_WRITES: Write[] = [
  'cms-publish',
  'email-send',
  'social-post',
  'repo-main',
  'vercel-deploy',
];

export interface Trigger {
  type: 'schedule' | 'chat' | 'repo-event' | 'webhook' | 'manual';
  cron?: string;
  timezone?: string;
  channel?: string;
  event?: string;
  paths?: string[];
}

export interface Manifest {
  version: 1;
  name: string;
  owner: string;
  description: string;
  tags: string[];
  deploy: { platform: Platform; schedule?: string; timezone?: string; workflow?: string; harness?: 'none' };
  triggers: Trigger[];
  policy: {
    untrustedInput: boolean;
    connections: string[];
    writes: Write[];
    approval: 'none' | 'draft-only' | 'pr-review' | 'human';
    spendCapUsd?: number;
    idempotencyKey?: string;
    cmsRole?: string;
    cmsRoleAssertedBy?: string;
  };
  content?: {
    voice?: string;
    rubric?: string;
    positioning?: string;
    nThreshold?: Record<string, number>;
    clusters?: string[];
    emits?: string[];
  };
  observability: { traces: 'none' | 'platform' | 'otel' | 'both'; alertChannel: string; evals?: string };
}

export interface LoadedManifest {
  dir: string;
  file: string;
  manifest: Manifest;
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
// @ts-expect-error ajv-formats CJS default export
(addFormats.default ?? addFormats)(ajv);
const schema = JSON.parse(readFileSync(path.join(here, '..', 'agent.schema.json'), 'utf8'));
export const validateManifest = ajv.compile(schema);

export const loadManifests = (root: string): LoadedManifest[] => {
  const agentsDir = path.join(root, 'agents');
  if (!existsSync(agentsDir)) return [];
  return readdirSync(agentsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => {
      const file = path.join(agentsDir, d.name, 'agent.yaml');
      if (!existsSync(file)) return [{ dir: d.name, file, manifest: null as never }];
      return [{ dir: d.name, file, manifest: parseYaml(readFileSync(file, 'utf8')) as Manifest }];
    });
};

export interface ConnectionRegistry {
  connections: Record<string, { kind: string; owner: string; rotation: unknown }>;
}

export const loadConnections = (root: string): ConnectionRegistry => {
  const file = path.join(root, 'config', 'connections.yaml');
  return parseYaml(readFileSync(file, 'utf8')) as ConnectionRegistry;
};
