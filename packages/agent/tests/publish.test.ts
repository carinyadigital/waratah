/**
 * The publisher, against a fake API.
 *
 * These cover the parts that only go wrong once, in production: the order
 * things are created in, what a re-run does to an account that already has
 * them, and whether a roster ends up pointing at real ids.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { flatten, loadAll, type AgentDefinition } from '../src/load';
import { claude } from '../src/providers/claude';
import { publish, PublishError } from '../src/publish/claude';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const env = {
  ANALYTICS_MCP_URL: 'https://analytics.example/mcp',
  CLAUDE_ENVIRONMENT_ID: 'env_01xyz',
  VAULT_ID_CONTENT_MARKETING: 'vlt_01xyz',
} as NodeJS.ProcessEnv;

/** The artifacts, in publish order, exactly as the CLI assembles them. */
const ordered = () =>
  flatten(loadAll(root))
    .filter((agent: AgentDefinition) => !agent.providers || 'claude' in agent.providers)
    .map((agent) => {
      const files = claude.render(agent);
      return {
        agent,
        definition: files[0].content,
        deployments: agent.schedules.map((s, i) => ({ name: s.name, content: files[i + 1].content })),
      };
    });

interface Call {
  method: string;
  path: string;
  body?: any;
}

/** A fake API that records calls and hands back plausible ids. */
const fakeApi = (seed: { agents?: any[]; deployments?: any[] } = {}) => {
  const calls: Call[] = [];
  let n = 0;

  const fetchImpl = (async (url: string, init: any) => {
    const p = String(url).replace('https://api.anthropic.com/v1', '');
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method: init.method, path: p, body });

    const ok = (data: unknown) =>
      ({ ok: true, status: 200, text: async () => JSON.stringify(data) }) as Response;

    if (init.method === 'GET' && p.startsWith('/agents')) {
      return ok({ data: seed.agents ?? [], has_more: false });
    }
    if (init.method === 'GET' && p.startsWith('/deployments')) {
      return ok({ data: seed.deployments ?? [], has_more: false });
    }
    if (init.method === 'POST' && p === '/agents') {
      n += 1;
      return ok({ id: `agent_new${n}`, name: body.name, version: 1 });
    }
    if (init.method === 'POST' && p.startsWith('/agents/')) {
      return ok({ id: p.split('/')[2], name: body.name, version: 7 });
    }
    if (init.method === 'POST' && p === '/deployments') {
      return ok({ id: 'depl_new1', name: body.name });
    }
    return ok({});
  }) as unknown as typeof fetch;

  return { calls, fetchImpl };
};

const run = async (api: ReturnType<typeof fakeApi>) => {
  const log: string[] = [];
  await publish(ordered(), {
    apiKey: 'sk-test',
    env,
    log: (l) => log.push(l),
    fetchImpl: api.fetchImpl,
  });
  return log;
};

describe('publishing to an empty account', () => {
  it('creates subagents before the coordinator, and the deployment last', async () => {
    const api = fakeApi();
    await run(api);

    const writes = api.calls.filter((c) => c.method === 'POST');
    expect(writes.map((c) => `${c.path} ${c.body.name}`)).toEqual([
      '/agents content-analyst',
      '/agents market-researcher',
      '/agents content-marketer',
      '/deployments content-marketer-discovery',
    ]);
  });

  it('sends a coordinator roster of real ids, with no placeholder left in it', async () => {
    const api = fakeApi();
    await run(api);

    const coordinator = api.calls.find((c) => c.body?.name === 'content-marketer')!;
    expect(coordinator.body.multiagent.agents).toEqual([
      { type: 'agent', id: 'agent_new1', version: 1 },
      { type: 'agent', id: 'agent_new2', version: 1 },
    ]);
    expect(JSON.stringify(coordinator.body)).not.toMatch(/\$\{/);
  });

  it('resolves env placeholders in what it sends', async () => {
    const api = fakeApi();
    await run(api);

    const analyst = api.calls.find((c) => c.body?.name === 'content-analyst')!;
    expect(analyst.body.mcp_servers[0].url).toBe('https://analytics.example/mcp');

    const deployment = api.calls.find((c) => c.path === '/deployments')!;
    expect(deployment.body.environment_id).toBe('env_01xyz');
    expect(deployment.body.vault_ids).toEqual(['vlt_01xyz']);
    expect(deployment.body.agent).toBe('agent_new3');
  });

  it('carries the beta header and api key on every call', async () => {
    const api = fakeApi();
    const seen: any[] = [];
    const wrapped = {
      ...api,
      fetchImpl: (async (url: string, init: any) => {
        seen.push(init.headers);
        return api.fetchImpl(url as any, init);
      }) as unknown as typeof fetch,
    };
    await run(wrapped);
    expect(seen.length).toBeGreaterThan(0);
    for (const h of seen) {
      expect(h['anthropic-beta']).toBe('managed-agents-2026-04-01');
      expect(h['x-api-key']).toBe('sk-test');
    }
  });
});

describe('re-running against an account that already has them', () => {
  it('updates existing agents instead of creating duplicates', async () => {
    const api = fakeApi({
      agents: [
        { id: 'agent_01aaa', name: 'content-analyst', version: 3 },
        { id: 'agent_01bbb', name: 'market-researcher', version: 2 },
        { id: 'agent_01ccc', name: 'content-marketer', version: 5 },
      ],
    });
    await run(api);

    const writes = api.calls.filter((c) => c.method === 'POST');
    expect(writes.map((c) => c.path)).toEqual([
      '/agents/agent_01aaa',
      '/agents/agent_01bbb',
      '/agents/agent_01ccc',
      '/deployments',
    ]);
  });

  it('leaves an existing deployment alone rather than guessing an update verb', async () => {
    const api = fakeApi({ deployments: [{ id: 'depl_01', name: 'content-marketer-discovery', version: 1 }] });
    const log = await run(api);

    expect(api.calls.filter((c) => c.path === '/deployments' && c.method === 'POST')).toHaveLength(0);
    expect(log.join('\n')).toMatch(/skipped deployment content-marketer-discovery/);
  });

  it('warns when a roster pin no longer matches the version just published', async () => {
    // Updating an existing agent returns version 7; the roster pins version 1.
    const api = fakeApi({ agents: [{ id: 'agent_01aaa', name: 'content-analyst', version: 3 }] });
    const log = await run(api);

    expect(log.join('\n')).toMatch(
      /content-marketer pins content-analyst at version 1, but version 7 was just published/,
    );
  });
});

describe('failure handling', () => {
  it('reports an API rejection with its status and body, and stops', async () => {
    const fetchImpl = (async (url: string, init: any) => {
      const p = String(url).replace('https://api.anthropic.com/v1', '');
      if (init.method === 'GET') {
        return { ok: true, status: 200, text: async () => JSON.stringify({ data: [], has_more: false }) } as Response;
      }
      return {
        ok: false,
        status: 400,
        text: async () => '{"error":{"message":"multiagent.agents[0].id is not a valid agent"}}',
      } as Response;
    }) as unknown as typeof fetch;

    await expect(
      publish(ordered(), { apiKey: 'sk-test', env, log: () => {}, fetchImpl }),
    ).rejects.toThrow(PublishError);
    await expect(
      publish(ordered(), { apiKey: 'sk-test', env, log: () => {}, fetchImpl }),
    ).rejects.toThrow(/not a valid agent/);
  });

  it('stops before writing anything when a required variable is unset', async () => {
    const api = fakeApi();
    await expect(
      publish(ordered(), { apiKey: 'sk-test', env: {} as NodeJS.ProcessEnv, log: () => {}, fetchImpl: api.fetchImpl }),
    ).rejects.toThrow(/ANALYTICS_MCP_URL/);

    expect(api.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });
});

describe('dry run', () => {
  it('touches nothing and reports what is still unset', async () => {
    const api = fakeApi();
    const log: string[] = [];
    await publish(ordered(), {
      apiKey: 'dry-run',
      dryRun: true,
      env: {} as NodeJS.ProcessEnv,
      log: (l) => log.push(l),
      fetchImpl: api.fetchImpl,
    });

    expect(api.calls).toHaveLength(0);
    expect(log.join('\n')).toContain('ANALYTICS_MCP_URL');
    expect(log.join('\n')).toContain('CLAUDE_ENVIRONMENT_ID');
    expect(log.join('\n')).toContain('VAULT_ID_CONTENT_MARKETING');
  });
});
