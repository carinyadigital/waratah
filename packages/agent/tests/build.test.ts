import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadAll, resolveSecrets, type AgentDefinition } from '../src/load';
import { claude } from '../src/providers/claude';
import { cursor } from '../src/providers/cursor';
import { UnsupportedFeatureError } from '../src/providers/index';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const lead = () => loadAll(root).find((a) => a.name === 'content-marketer') as AgentDefinition;
const analyst = () => lead().subagents.find((a) => a.name === 'content-analyst') as AgentDefinition;
const researcher = () => lead().subagents.find((a) => a.name === 'market-researcher') as AgentDefinition;

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

  it("carries content-analyst's instructions.md through as its system prompt", () => {
    expect(analyst().instructions).toContain('Those and only those');
  });
});

describe('claude', () => {
  const files = () => claude.render(lead());

  it('emits a coordinator and one deployment per schedule', () => {
    expect(files().map((f) => f.file)).toEqual(['agent.json', 'deployments/discovery.json']);
  });

  it('resolves the model tier and records which tier produced it', () => {
    const agent = files()[0].content as { model: string; metadata: { model_tier: string } };
    expect(agent.model).toBe('claude-opus-5');
    expect(agent.metadata.model_tier).toBe('strong');
  });

  it('renders the connector as a url mcp server with an always_allow policy', () => {
    const agent = files()[0].content as {
      mcp_servers: { name: string; type: string; url: string }[];
      tools: { type: string; mcp_server_name?: string; default_config?: { permission_policy: { type: string } } }[];
    };
    expect(agent.mcp_servers).toEqual([{ name: 'backlog', type: 'url', url: 'https://mcp.linear.app/mcp' }]);
    const toolset = agent.tools.find((t) => t.mcp_server_name === 'backlog');
    expect(toolset?.default_config?.permission_policy.type).toBe('always_allow');
  });

  it('renders the multiagent roster by name and version, with no account-specific id at build time', () => {
    const agent = files()[0].content as {
      multiagent: { type: string; agents: { name: string; version: number }[] };
    };
    expect(agent.multiagent).toEqual({
      type: 'coordinator',
      agents: [
        { name: 'content-analyst', version: 1 },
        { name: 'market-researcher', version: 1 },
      ],
    });
  });

  it('renders the schedule as a cron expression with an IANA timezone and a required opening message', () => {
    const deployment = files()[1].content as {
      schedule: { expression: string; timezone: string };
      initial_events: { type: string; message: string }[];
    };
    expect(deployment.schedule).toEqual({ expression: '0 7 1 * *', timezone: 'Australia/Sydney' });
    expect(deployment.initial_events).toEqual([
      { type: 'user', message: expect.stringContaining('discovery cycle') },
    ]);
  });

  it('renders skills as directory names — the gap where an agent built clean and deployed silently without them', () => {
    const a = { ...analyst(), skills: ['soil-carbon-glossary'] };
    const rendered = claude.render(a)[0].content as { skills?: { name: string }[] };
    expect(rendered.skills).toEqual([{ name: 'soil-carbon-glossary' }]);
  });

  it('leaves secrets unresolved in the built artifact', () => {
    expect(JSON.stringify(claude.render(analyst()))).toContain('${ANALYTICS_MCP_URL}');
    expect(JSON.stringify(claude.render(analyst()))).not.toContain('https://');
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

  it('still renders a cron trigger for a definition that does carry a schedule', () => {
    const a = {
      ...researcher(),
      schedules: [
        { name: 'weekly', description: 'a test schedule', cron: '0 7 * * MON', timezone: 'Australia/Sydney', prompt: 'go' },
      ],
    };
    const agent = cursor.render(a)[0].content as { triggers: { cron: { expression: string } }[] };
    expect(agent.triggers[0].cron.expression).toBe('0 7 * * MON');
  });
});

describe('the build fails rather than degrading', () => {
  it('refuses a stdio connector on claude, and says how to fix it', () => {
    const a = analyst();
    a.connectors = [{ ...a.connectors[0], transport: { type: 'stdio', command: 'pipx', args: ['run', 'ga4-mcp'] } }];
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
    a.skills = ['soil-carbon-glossary'];
    expect(() => cursor.render(a)).toThrow(/skills/);
  });

  it('refuses a multiagent roster on cursor, which has no coordinator concept', () => {
    expect(() => cursor.render(lead())).toThrow(UnsupportedFeatureError);
    expect(() => cursor.render(lead())).toThrow(/coordinator roster/);
  });
});

describe('deploy-time secret resolution', () => {
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
});
