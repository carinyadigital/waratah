/**
 * Discovery and validation.
 *
 * An agent is a directory. agent.yaml carries identity; everything else is
 * found by walking sibling directories, so adding a connector is adding a file.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse as parseYaml } from 'yaml';

const here = path.dirname(fileURLToPath(import.meta.url));

const ajv = new Ajv2020({ allErrors: true, strict: false });
const applyFormats = (addFormats as unknown as { default?: typeof addFormats }).default ?? addFormats;
applyFormats(ajv);

const compile = (name: string) =>
  ajv.compile(JSON.parse(readFileSync(path.join(here, 'schema', `${name}.schema.json`), 'utf8')));

const validators = {
  agent: compile('agent'),
  connector: compile('connector'),
  schedule: compile('schedule'),
};

export type Permission = 'ask' | 'allow' | 'deny';

export interface Connector {
  name: string;
  description: string;
  vendor: string;
  readOnly?: boolean;
  transport: { type: 'url'; url: string } | { type: 'stdio'; command: string; args?: string[] };
}

export interface Schedule {
  name: string;
  description: string;
  cron: string;
  timezone: string;
  prompt?: string;
}

export interface AgentDefinition {
  dir: string;
  name: string;
  description: string;
  instructions: string;
  model: 'strong' | 'standard' | 'fast';
  permissions: { default: Permission; connectors?: Record<string, Permission> };
  providers?: {
    claude?: { mode?: 'managed'; environment?: string };
    cursor?: { scope?: 'private' | 'team'; memory?: boolean };
  };
  connectors: Connector[];
  schedules: Schedule[];
  skills: string[];
}

export class DefinitionError extends Error {}

const check = (kind: keyof typeof validators, data: unknown, where: string) => {
  const validate = validators[kind];
  if (validate(data)) return;
  const detail = (validate.errors ?? [])
    .map((e) => `  ${e.instancePath || '/'} ${e.message ?? ''}`)
    .join('\n');
  throw new DefinitionError(`${where} is not a valid ${kind}:\n${detail}`);
};

/**
 * Resolve ${VAR} against the environment, at DEPLOY time only.
 *
 * Built artifacts keep the placeholder literal, so dist/ is deterministic,
 * reviewable, and contains no endpoint or token. An unset variable is a hard
 * failure rather than an empty string in something about to be deployed.
 */
export const interpolate = (value: string, where: string, env = process.env): string =>
  value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, key: string) => {
    const resolved = env[key];
    if (!resolved) {
      throw new DefinitionError(`${where} references \${${key}}, which is not set in the environment`);
    }
    return resolved;
  });

/** Walk a rendered artifact resolving every ${VAR}. Used by deploy, never by build. */
export const resolveSecrets = <T>(content: T, where: string, env = process.env): T =>
  JSON.parse(
    JSON.stringify(content).replace(/\$\{[A-Z0-9_]+\}/g, (match) => {
      const resolved = interpolate(match, where, env);
      return JSON.stringify(resolved).slice(1, -1);
    }),
  ) as T;

const readDir = <T>(dir: string, kind: keyof typeof validators): T[] => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .sort()
    .map((f) => {
      const file = path.join(dir, f);
      const data = parseYaml(readFileSync(file, 'utf8'));
      check(kind, data, file);
      return data as T;
    });
};

export const loadAgent = (dir: string): AgentDefinition => {
  const manifestFile = path.join(dir, 'agent.yaml');
  if (!existsSync(manifestFile)) throw new DefinitionError(`${dir} has no agent.yaml`);

  const manifest = parseYaml(readFileSync(manifestFile, 'utf8')) as Record<string, unknown>;
  check('agent', manifest, manifestFile);

  const base = path.basename(dir);
  if (manifest.name !== base) {
    throw new DefinitionError(`${manifestFile}: name "${String(manifest.name)}" does not match directory "${base}"`);
  }

  const instructionsFile = path.resolve(dir, String(manifest.instructions));
  if (!existsSync(instructionsFile)) {
    throw new DefinitionError(`${manifestFile}: instructions "${String(manifest.instructions)}" does not exist`);
  }

  // Placeholders are left literal. Deploy resolves them; build must stay
  // deterministic so dist/ can be committed and reviewed.
  const connectors = readDir<Connector>(path.join(dir, 'connectors'), 'connector');

  const known = new Set(connectors.map((c) => c.name));
  for (const name of Object.keys((manifest.permissions as AgentDefinition['permissions']).connectors ?? {})) {
    if (!known.has(name)) {
      throw new DefinitionError(`${manifestFile}: permissions name connector "${name}", which has no file in connectors/`);
    }
  }

  const skillsDir = path.join(dir, 'skills');
  const skills = existsSync(skillsDir)
    ? readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
    : [];

  return {
    dir,
    name: String(manifest.name),
    description: String(manifest.description),
    instructions: readFileSync(instructionsFile, 'utf8').trim(),
    model: manifest.model as AgentDefinition['model'],
    permissions: manifest.permissions as AgentDefinition['permissions'],
    providers: manifest.providers as AgentDefinition['providers'],
    connectors,
    schedules: readDir<Schedule>(path.join(dir, 'schedules'), 'schedule'),
    skills,
  };
};

export const loadAll = (root: string): AgentDefinition[] => {
  const agentsDir = path.join(root, 'agents');
  if (!existsSync(agentsDir)) return [];
  return readdirSync(agentsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(agentsDir, d.name, 'agent.yaml')))
    .map((d) => loadAgent(path.join(agentsDir, d.name)));
};
