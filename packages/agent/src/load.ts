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
  skill: compile('skill'),
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
  /** Required — becomes the deploy API's initial_events user.message. A scheduled run has no human to type it. */
  prompt: string;
}

export interface Skill {
  name: string;
  type: 'anthropic' | 'custom';
  skill_id: string;
  version?: string;
}

export interface MultiagentRoster {
  type: 'coordinator';
  agents: { name: string; version: number }[];
}

export interface AgentDefinition {
  dir: string;
  /** Repo-relative path to agent.yaml. Recorded in the built artifact, so it has to be the real path, including for a subagent nested under a coordinator. */
  source: string;
  name: string;
  description: string;
  instructions: string;
  model: 'strong' | 'standard' | 'fast';
  permissions: { default: Permission; connectors?: Record<string, Permission> };
  providers?: {
    claude?: { mode?: 'managed'; environment?: string; vaults?: string[] };
    cursor?: { scope?: 'private' | 'team'; memory?: boolean };
  };
  connectors: Connector[];
  schedules: Schedule[];
  skills: Skill[];
  /** Set only on a coordinator. The version pin lives in agent.yaml; the roster is discovered from subagents/. */
  multiagent?: MultiagentRoster;
  /**
   * Depth one only — the platform ignores delegation past a subagent's own
   * subagents/, so loadAgent fails the build rather than silently truncating
   * a nested roster. A subagent never carries schedules: it has no clock of
   * its own, it is spawned at runtime by its coordinator.
   */
  subagents: AgentDefinition[];
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

export const loadAgent = (dir: string, root = process.cwd()): AgentDefinition => {
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

  // One file per skill, like connectors. A skill is declared, not vendored:
  // the file names an id the workspace already has, it does not carry the
  // skill's content.
  const skills = readDir<Skill>(path.join(dir, 'skills'), 'skill');

  // Subagents are discovered one level down, never recursively — the platform
  // ignores delegation past depth one, so a nested roster fails the build
  // rather than deploying silently truncated.
  const subagentsDir = path.join(dir, 'subagents');
  const subagents = existsSync(subagentsDir)
    ? readdirSync(subagentsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && existsSync(path.join(subagentsDir, d.name, 'agent.yaml')))
        .map((d) => {
          const subDir = path.join(subagentsDir, d.name);
          const sub = loadAgent(subDir, root);
          if (sub.schedules.length) {
            throw new DefinitionError(
              `${path.join(subDir, 'agent.yaml')}: a subagent may not declare schedules/ (${sub.schedules.map((s) => s.name).join(', ')}). It has no clock of its own — its coordinator spawns it at runtime.`,
            );
          }
          if (sub.subagents.length) {
            throw new DefinitionError(
              `${path.join(subDir, 'agent.yaml')}: a subagent may not declare its own subagents/. The platform ignores delegation past depth one, so this would deploy with the nested roster silently dropped.`,
            );
          }
          return sub;
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  const multiagent = manifest.multiagent as MultiagentRoster | undefined;
  if (multiagent) {
    const declared = new Set(multiagent.agents.map((a) => a.name));
    const discovered = new Set(subagents.map((a) => a.name));
    for (const name of declared) {
      if (!discovered.has(name)) {
        throw new DefinitionError(`${manifestFile}: multiagent names "${name}", which has no directory in subagents/`);
      }
    }
    for (const name of discovered) {
      if (!declared.has(name)) {
        throw new DefinitionError(`${manifestFile}: subagents/${name} exists but is not listed in multiagent.agents — an undeclared roster member has no version pin`);
      }
    }
  } else if (subagents.length) {
    throw new DefinitionError(`${manifestFile}: subagents/ has ${subagents.length} director${subagents.length === 1 ? 'y' : 'ies'} but no multiagent block declares them`);
  }

  return {
    dir,
    source: path.relative(root, manifestFile),
    name: String(manifest.name),
    description: String(manifest.description),
    instructions: readFileSync(instructionsFile, 'utf8').trim(),
    model: manifest.model as AgentDefinition['model'],
    permissions: manifest.permissions as AgentDefinition['permissions'],
    providers: manifest.providers as AgentDefinition['providers'],
    connectors,
    schedules: readDir<Schedule>(path.join(dir, 'schedules'), 'schedule'),
    skills,
    multiagent,
    subagents,
  };
};

export const loadAll = (root: string): AgentDefinition[] => {
  const agentsDir = path.join(root, 'agents');
  if (!existsSync(agentsDir)) return [];
  return readdirSync(agentsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(agentsDir, d.name, 'agent.yaml')))
    .map((d) => loadAgent(path.join(agentsDir, d.name), root));
};

/**
 * Every agent in the tree, subagents before the coordinator that names them.
 *
 * Deploy order, not display order: a coordinator's roster is resolved to
 * account-specific ids, so the agents it delegates to have to exist first.
 */
export const flatten = (agents: AgentDefinition[]): AgentDefinition[] =>
  agents.flatMap((agent) => [...agent.subagents, agent]);
