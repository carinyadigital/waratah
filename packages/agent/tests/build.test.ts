import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { flatten, loadAll, resolveSecrets, type AgentDefinition } from '../src/load';
import { claude } from '../src/providers/claude';
import { cursor } from '../src/providers/cursor';
import { UnsupportedFeatureError } from '../src/providers/index';
import { resolveAgentRefs, PublishError } from '../src/publish/claude';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const lead = () => loadAll(root).find((a) => a.name === 'content-marketer') as AgentDefinition;
const analyst = () => lead().subagents.find((a) => a.name === 'content-analyst') as AgentDefinition;

describe('definitions', () => {
  it('discovers content-marketer as a coordinator with its connector, schedule and roster', () => {
    const a = lead();
    expect(a.model).toBe('strong');
    expect(a.connectors.map((c) => c.name)).toEqual(['backlog']);
    expect(a.schedules.map((s) => s.name)).toEqual(['discovery']);
    expect(a.multiagent?.agents).toEqual([
      { name: 'content-analyst', version: 1 },
      { name: 'market-researcher', version: 1 },
    ]);
  });

  it('discovers both subagents beneath content-marketer, neither carrying a schedule or roster of its own', () => {
    expect(lead().subagents.map((a) => a.name)).toEqual(['content-analyst', 'market-researcher']);
    for (const sub of lead().subagents) {
      expect(sub.schedules).toEqual([]);
      expect(sub.subagents).toEqual([]);
    }
  });

  it("records each definition's real path, including subagents nested under a coordinator", () => {
    expect(lead().source).toBe('agents/content-marketer/agent.yaml');
    expect(analyst().source).toBe('agents/content-marketer/subagents/content-analyst/agent.yaml');
  });

  it("carries content-analyst's instructions.md through as its system prompt", () => {
    expect(analyst().instructions).toContain('Those and only those');
  });

  it('orders subagents before the coordinator that names them', () => {
    expect(flatten(loadAll(root)).map((a) => a.name)).toEqual([
      'content-analyst',
      'market-researcher',
      'content-marketer',
    ]);
  });
});

describe('claude renders the API request body', () => {
  const files = () => claude.render(lead());
  const agentBody = () => files()[0].content as Record<string, any>;
  const deployment = () => files()[1].content as Record<string, any>;

  it('emits a coordinator and one deployment per schedule', () => {
    expect(files().map((f) => f.file)).toEqual(['agent.json', 'deployments/discovery.json']);
  });

  it('resolves the model tier and records which tier produced it', () => {
    expect(agentBody().model).toBe('claude-opus-5');
    expect(agentBody().metadata.model_tier).toBe('strong');
    expect(agentBody().metadata.source).toBe('agents/content-marketer/agent.yaml');
  });

  it('renders each connector as a url mcp server with a matching toolset', () => {
    const body = agentBody();
    expect(body.mcp_servers).toEqual([
      { type: 'url', name: 'backlog', url: 'https://mcp.linear.app/mcp' },
    ]);
    // The API rejects both unreferenced servers and dangling toolsets.
    const servers = body.mcp_servers.map((s: { name: string }) => s.name).sort();
    const toolsets = body.tools
      .filter((t: { type: string }) => t.type === 'mcp_toolset')
      .map((t: { mcp_server_name: string }) => t.mcp_server_name)
      .sort();
    expect(toolsets).toEqual(servers);
    expect(body.tools[0]).toEqual({ type: 'agent_toolset_20260401' });
  });

  it('renders the roster as {type, id, version} with the id left as a deploy-time reference', () => {
    expect(agentBody().multiagent).toEqual({
      type: 'coordinator',
      agents: [
        { type: 'agent', id: '${agent:content-analyst}', version: 1 },
        { type: 'agent', id: '${agent:market-researcher}', version: 1 },
      ],
    });
  });

  it('renders skills as {type, skill_id}, not as bare directory names', () => {
    const withSkills = {
      ...analyst(),
      skills: [
        { name: 'xlsx', type: 'anthropic' as const, skill_id: 'xlsx' },
        { name: 'house-style', type: 'custom' as const, skill_id: 'skill_abc123', version: 'latest' },
      ],
    };
    const rendered = claude.render(withSkills)[0].content as { skills: unknown };
    expect(rendered.skills).toEqual([
      { type: 'anthropic', skill_id: 'xlsx' },
      { type: 'custom', skill_id: 'skill_abc123', version: 'latest' },
    ]);
  });

  it('omits skills entirely when none are declared', () => {
    expect(agentBody()).not.toHaveProperty('skills');
  });

  it('renders a deployment carrying every field the API requires', () => {
    const d = deployment();
    expect(d.name).toBe('content-marketer-discovery');
    expect(d.agent).toBe('${agent:content-marketer}');
    expect(d.environment_id).toBe('${CLAUDE_ENVIRONMENT_ID}');
    expect(d.schedule).toEqual({
      type: 'cron',
      expression: '0 7 1 * *',
      timezone: 'Australia/Sydney',
    });
    expect(d.initial_events).toEqual([
      {
        type: 'user.message',
        content: [{ type: 'text', text: expect.stringContaining('discovery cycle') }],
      },
    ]);
    // Not a documented deployment field; sending it risks a rejection.
    expect(d).not.toHaveProperty('description');
  });

  it('renders declared vaults as placeholders, never as credentials', () => {
    expect(deployment().vault_ids).toEqual(['${VAULT_ID_CONTENT_MARKETING}']);
  });

  it('leaves secrets unresolved in the built artifact', () => {
    const rendered = JSON.stringify(claude.render(analyst()));
    expect(rendered).toContain('${ANALYTICS_MCP_URL}');
    expect(rendered).not.toContain('https://');
  });
});

describe('cursor', () => {
  it('renders a subagent definition into cursor shape', () => {
    const agent = cursor.render(analyst())[0].content as {
      model: string;
      triggers: unknown[];
      actions: { mcp: { server: { name: string } } }[];
      prompts: { prompt: string }[];
      scope: string;
    };
    expect(agent.model).toBe('cursor-grok-4.5-high-fast');
    expect(agent.triggers).toEqual([]);
    expect(agent.actions[0].mcp.server.name).toBe('analytics');
    expect(agent.prompts[0].prompt).toContain('Those and only those');
    expect(agent.scope).toBe('private');
  });
});

describe('the build fails rather than degrading', () => {
  it('refuses a stdio connector on claude, and says how to fix it', () => {
    const a = analyst();
    a.connectors = [
      { ...a.connectors[0], transport: { type: 'stdio', command: 'pipx', args: ['run', 'ga4-mcp'] } },
    ];
    expect(() => claude.render(a)).toThrow(UnsupportedFeatureError);
    expect(() => claude.render(a)).toThrow(/MCP tunnel/);
  });

  it('refuses per-connector ask on cursor, which has no such policy', () => {
    const a = analyst();
    a.permissions = { default: 'ask', connectors: { analytics: 'ask' } };
    expect(() => cursor.render(a)).toThrow(UnsupportedFeatureError);
  });

  it('refuses skills on cursor', () => {
    const a = analyst();
    a.skills = [{ name: 'xlsx', type: 'anthropic', skill_id: 'xlsx' }];
    expect(() => cursor.render(a)).toThrow(/skills/);
  });

  it('refuses a multiagent roster on cursor, which has no coordinator concept', () => {
    expect(() => cursor.render(lead())).toThrow(UnsupportedFeatureError);
    expect(() => cursor.render(lead())).toThrow(/coordinator roster/);
  });
});

describe('deploy-time resolution', () => {
  const ids = () =>
    new Map([
      ['content-analyst', 'agent_01aaa'],
      ['market-researcher', 'agent_01bbb'],
      ['content-marketer', 'agent_01ccc'],
    ]);

  it('substitutes env vars into a rendered artifact', () => {
    const resolved = resolveSecrets(claude.render(analyst()), 'test', {
      ANALYTICS_MCP_URL: 'https://mcp.example.com/mcp',
    } as NodeJS.ProcessEnv);
    expect(JSON.stringify(resolved)).toContain('https://mcp.example.com/mcp');
  });

  it('throws rather than deploying an empty endpoint', () => {
    expect(() => resolveSecrets(claude.render(analyst()), 'test', {} as NodeJS.ProcessEnv)).toThrow(
      /ANALYTICS_MCP_URL/,
    );
  });

  it('substitutes agent ids into a coordinator roster', () => {
    const resolved = resolveAgentRefs(claude.render(lead())[0].content, ids()) as {
      multiagent: { agents: { id: string }[] };
    };
    expect(resolved.multiagent.agents.map((a) => a.id)).toEqual(['agent_01aaa', 'agent_01bbb']);
  });

  it('refuses to resolve a roster entry that has not been created yet', () => {
    expect(() => resolveAgentRefs(claude.render(lead())[0].content, new Map())).toThrow(PublishError);
    expect(() => resolveAgentRefs(claude.render(lead())[0].content, new Map())).toThrow(
      /must be published before/,
    );
  });

  it('leaves a fully resolved payload free of placeholders', () => {
    const [agentFile, deploymentFile] = claude.render(lead());
    const env = {
      CLAUDE_ENVIRONMENT_ID: 'env_01xyz',
      VAULT_ID_CONTENT_MARKETING: 'vlt_01xyz',
    } as NodeJS.ProcessEnv;

    const body = JSON.stringify([
      resolveAgentRefs(resolveSecrets(agentFile.content, 'test', env), ids()),
      resolveAgentRefs(resolveSecrets(deploymentFile.content, 'test', env), ids()),
    ]);
    expect(body).not.toMatch(/\$\{/);
  });
});
