/**
 * The Claude Managed Agents publisher.
 *
 * Takes the committed artifacts and makes the account match them. Ordering is
 * the whole problem: a coordinator's roster is a list of account-specific
 * agent ids, so every agent it delegates to has to exist before it does, and
 * the deployment has to come last because it points at the coordinator.
 *
 *   subagents -> coordinator (roster resolved) -> deployments
 *
 * Idempotent by name. A re-run after a partial failure picks up where it
 * stopped rather than creating a second copy of everything, because a failed
 * publish that cannot be safely retried is worse than one that never ran.
 */
import { DefinitionError, resolveSecrets, type AgentDefinition } from '../load';

const API = 'https://api.anthropic.com/v1';
const BETA = 'managed-agents-2026-04-01';

export interface PublishOptions {
  apiKey: string;
  /** Print what would happen and change nothing. */
  dryRun?: boolean;
  env?: NodeJS.ProcessEnv;
  log?: (line: string) => void;
  fetchImpl?: typeof fetch;
}

interface RemoteAgent {
  id: string;
  name: string;
  version: number;
}

export class PublishError extends Error {}

/** Resolve ${agent:<name>} against agents created earlier in this run. */
export const resolveAgentRefs = <T>(payload: T, ids: Map<string, string>): T =>
  JSON.parse(
    JSON.stringify(payload).replace(/\$\{agent:([a-z0-9-]+)\}/g, (_, name: string) => {
      const id = ids.get(name);
      if (!id) {
        throw new PublishError(
          `payload references \${agent:${name}}, which was not created in this run. ` +
            'Its definition must be published before anything that delegates to it.',
        );
      }
      return id;
    }),
  ) as T;

const request = async (
  opts: PublishOptions,
  method: string,
  path: string,
  body?: unknown,
): Promise<Record<string, unknown>> => {
  const doFetch = opts.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await doFetch(`${API}${path}`, {
      method,
      headers: {
        'x-api-key': opts.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': BETA,
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (cause) {
    // A partially published account is the expensive failure here, so say
    // plainly that the call never landed rather than printing a stack trace.
    throw new PublishError(
      `${method} ${path} could not reach the API: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  const text = await response.text();
  if (!response.ok) {
    throw new PublishError(`${method} ${path} failed (${response.status}): ${text.slice(0, 600)}`);
  }
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
};

/**
 * Every ${VAR} the payloads need but the environment does not have.
 *
 * Dry-run reports the whole list at once. Resolving eagerly would throw on
 * the first one, which turns a readiness check into a guessing game.
 */
const missingVars = (payloads: unknown[], env: NodeJS.ProcessEnv): string[] => {
  const missing = new Set<string>();
  for (const match of JSON.stringify(payloads).matchAll(/\$\{([A-Z0-9_]+)\}/g)) {
    if (!env[match[1]]) missing.add(match[1]);
  }
  return [...missing].sort();
};

/** Every existing agent, by name. Paginated; the API returns newest first. */
const listRemote = async (opts: PublishOptions, resource: 'agents' | 'deployments') => {
  const found = new Map<string, RemoteAgent>();
  let after: string | undefined;

  do {
    const query = new URLSearchParams({ limit: '100', ...(after ? { after_id: after } : {}) });
    const page = await request(opts, 'GET', `/${resource}?${query}`);
    const data = (page.data ?? []) as RemoteAgent[];
    for (const item of data) {
      // Newest first, so the first sighting of a name is the current one.
      if (!found.has(item.name)) found.set(item.name, item);
    }
    after = page.has_more ? (page.last_id as string | undefined) : undefined;
  } while (after);

  return found;
};

/**
 * Publish every agent, then every deployment.
 *
 * `agents` is the full tree; subagents are published before the coordinator
 * that names them.
 */
export const publish = async (
  ordered: { agent: AgentDefinition; definition: unknown; deployments: { name: string; content: unknown }[] }[],
  opts: PublishOptions,
): Promise<void> => {
  const log = opts.log ?? console.log;
  const env = opts.env ?? process.env;
  const ids = new Map<string, string>();

  // A dry run touches nothing and needs no credential, so it reports what is
  // missing instead of failing on it. A real run resolves eagerly below, and
  // a missing variable stops it before anything reaches the account.
  if (opts.dryRun) {
    const payloads = ordered.flatMap((o) => [o.definition, ...o.deployments.map((d) => d.content)]);
    for (const { agent, deployments } of ordered) {
      log(`  would publish agent ${agent.name}`);
      for (const d of deployments) log(`  would publish deployment ${agent.name}-${d.name}`);
    }
    const missing = missingVars(payloads, env);
    if (missing.length) {
      log(`  ${missing.length} variable(s) still unset, needed before a real deploy:`);
      for (const name of missing) log(`    ${name}`);
    } else {
      log('  every ${VAR} in the artifacts resolves against this environment');
    }
    return;
  }

  const existingAgents = await listRemote(opts, 'agents');

  for (const { agent, definition } of ordered) {
    // Env placeholders first — a missing one is a hard failure, so it surfaces
    // before anything has been written to the account.
    const withSecrets = resolveSecrets(definition, `agents/${agent.name}`, env);
    const body = resolveAgentRefs(withSecrets, ids);
    const existing = existingAgents.get(agent.name);

    const result = existing
      ? await request(opts, 'POST', `/agents/${existing.id}`, body)
      : await request(opts, 'POST', '/agents', body);

    const id = String(result.id);
    const version = Number(result.version);
    ids.set(agent.name, id);
    log(`  ${existing ? 'updated' : 'created'} agent ${agent.name} (${id}, version ${version})`);

    // A roster pin that no longer matches what is deployed is the failure
    // this whole ordering exists to prevent, so say so rather than let a
    // coordinator quietly delegate to a version nobody is looking at.
    for (const { agent: other } of ordered) {
      const pin = other.multiagent?.agents.find((a) => a.name === agent.name);
      if (pin && pin.version !== version) {
        log(
          `  ! ${other.name} pins ${agent.name} at version ${pin.version}, but version ${version} was just published. ` +
            `Update multiagent.agents in ${other.source} to delegate to it.`,
        );
      }
    }
  }

  const existingDeployments = await listRemote(opts, 'deployments');

  for (const { deployments } of ordered) {
    for (const deployment of deployments) {
      const withSecrets = resolveSecrets(deployment.content, `deployments/${deployment.name}`, env);
      const body = resolveAgentRefs(withSecrets, ids) as { name: string };

      // Deployments expose pause, unpause, archive and run — there is no
      // documented update. Rather than guess a verb against a live schedule,
      // leave an existing one alone and say so.
      if (existingDeployments.has(body.name)) {
        log(
          `  skipped deployment ${body.name} — already exists. ` +
            'Archive it and re-run to change its schedule or opening message.',
        );
        continue;
      }

      const result = await request(opts, 'POST', '/deployments', body);
      log(`  created deployment ${body.name} (${String(result.id)})`);
    }
  }
};

export const requireApiKey = (env: NodeJS.ProcessEnv = process.env): string => {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new DefinitionError('deploy needs ANTHROPIC_API_KEY in the environment.');
  }
  return key;
};
