import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadAll, resolveSecrets, type AgentDefinition } from '../src/load';
import { claude } from '../src/providers/claude';
import { cursor } from '../src/providers/cursor';
import { UnsupportedFeatureError } from '../src/providers/index';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const analyst = () => loadAll(root).find((a) => a.name === 'content-analyst') as AgentDefinition;

describe('definitions', () => {
  it('discovers content-analyst with its connector and schedule', () => {
    const a = analyst();
    expect(a.model).toBe('strong');
    expect(a.connectors.map((c) => c.name)).toEqual(['analytics']);
    expect(a.schedules.map((s) => s.name)).toEqual(['weekly-performance']);
  });

  it('carries instructions.md through as the system prompt', () => {
    expect(analyst().instructions).toContain('Those and only those');
  });
});

describe('claude', () => {
  const files = () => claude.render(analyst());

  it('emits an agent and one deployment per schedule', () => {
    expect(files().map((f) => f.file)).toEqual(['agent.json', 'deployments/weekly-performance.json']);
  });

  it('resolves the model tier and records which tier produced it', () => {
    const agent = files()[0].content as { model: string; metadata: { model_tier: string } };
    expect(agent.model).toBe('claude-opus-5');
    expect(agent.metadata.model_tier).toBe('strong');
  });

  it('renders the connector as a url mcp server with an always_allow policy', () => {
    const agent = files()[0].content as {
      mcp_servers: { name: string; type: string }[];
      tools: { type: string; mcp_server_name?: string; default_config?: { permission_policy: { type: string } } }[];
    };
    expect(agent.mcp_servers).toEqual([{ name: 'analytics', type: 'url', url: '${ANALYTICS_MCP_URL}' }]);
    const toolset = agent.tools.find((t) => t.mcp_server_name === 'analytics');
    expect(toolset?.default_config?.permission_policy.type).toBe('always_allow');
  });

  it('renders the schedule as a cron expression with an IANA timezone', () => {
    const deployment = files()[1].content as { schedule: { expression: string; timezone: string } };
    expect(deployment.schedule).toEqual({ expression: '0 7 * * MON', timezone: 'Australia/Sydney' });
  });

  it('leaves secrets unresolved in the built artifact', () => {
    expect(JSON.stringify(files())).toContain('${ANALYTICS_MCP_URL}');
    expect(JSON.stringify(files())).not.toContain('https://');
  });
});

describe('cursor', () => {
  it('renders the same definition into cursor shape', () => {
    const agent = cursor.render(analyst())[0].content as {
      model: string;
      triggers: { cron: { expression: string } }[];
      actions: { mcp: { server: { name: string } } }[];
      prompts: { prompt: string }[];
      scope: string;
    };
    expect(agent.model).toBe('cursor-grok-4.5-high-fast');
    expect(agent.triggers[0].cron.expression).toBe('0 7 * * MON');
    expect(agent.actions[0].mcp.server.name).toBe('analytics');
    expect(agent.prompts[0].prompt).toContain('Those and only those');
    expect(agent.scope).toBe('private');
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
