/**
 * Claude Managed Agents.
 *
 * Two artifacts, because the platform has two concepts: an agent (model, system
 * prompt, tools, MCP servers) created once and referenced by id, and a scheduled
 * deployment (POSIX cron plus an IANA timezone) that starts sessions against it.
 *
 * Requests carry the `managed-agents-2026-04-01` beta header.
 */
import type { AgentDefinition, Permission } from '../load';
import { assertSupported, type Provider, type RenderedFile } from './index';

const MODELS = {
  strong: 'claude-opus-5',
  standard: 'claude-sonnet-5',
  fast: 'claude-haiku-4-5-20251001',
} as const;

const policy = (permission: Permission) => {
  switch (permission) {
    case 'allow':
      return { type: 'always_allow' as const };
    case 'deny':
      return { type: 'always_deny' as const };
    case 'ask':
      return { type: 'ask_user' as const };
  }
};

export const claude: Provider = {
  id: 'claude',
  models: MODELS,
  supports: {
    schedules: true,
    urlConnectors: true,
    // A managed sandbox reaches a private stdio server only through an MCP
    // tunnel, which is a limited research preview. Until that is enabled,
    // failing here is more useful than deploying an agent with no tools.
    stdioConnectors: false,
    perConnectorPermissions: true,
    skills: true,
    multiagent: true,
  },

  render(agent: AgentDefinition): RenderedFile[] {
    assertSupported(claude, agent);

    const model = MODELS[agent.model];
    const overlay = agent.providers?.claude ?? {};

    const definition = {
      name: agent.name,
      description: agent.description,
      model,
      system: agent.instructions,
      mcp_servers: agent.connectors.map((c) => ({
        name: c.name,
        type: 'url',
        url: (c.transport as { type: 'url'; url: string }).url,
      })),
      tools: [
        { type: 'agent_toolset_20260401' },
        ...agent.connectors.map((c) => ({
          type: 'mcp_toolset',
          mcp_server_name: c.name,
          default_config: {
            permission_policy: policy(agent.permissions.connectors?.[c.name] ?? agent.permissions.default),
          },
        })),
      ],
      // Directory names only. The skill's own content lives in the plugin
      // that ships it; this just tells the managed agent which ones to
      // mount. Never rendered before this fix — an agent with skills built
      // clean and deployed silently without them.
      ...(agent.skills.length ? { skills: agent.skills.map((name) => ({ name })) } : {}),
      // Names and version pins only. Account-specific agent ids do not exist
      // at build time — deploy resolves each name to an id, the same way
      // resolveSecrets resolves a ${VAR} at deploy and never at build, so
      // dist/ stays deterministic and reviewable.
      ...(agent.multiagent
        ? {
            multiagent: {
              type: agent.multiagent.type,
              agents: agent.multiagent.agents.map((a) => ({ name: a.name, version: a.version })),
            },
          }
        : {}),
      metadata: {
        source: `agents/${agent.name}/agent.yaml`,
        model_tier: agent.model,
        ...(overlay.environment ? { environment: overlay.environment } : {}),
      },
    };

    const files: RenderedFile[] = [{ file: 'agent.json', content: definition }];

    for (const schedule of agent.schedules) {
      files.push({
        file: `deployments/${schedule.name}.json`,
        content: {
          name: `${agent.name}-${schedule.name}`,
          description: schedule.description,
          schedule: { expression: schedule.cron, timezone: schedule.timezone },
          ...(overlay.environment ? { environment_id: overlay.environment } : {}),
          // Required by the deploy API, not optional decoration: a scheduled
          // run has no human to type the opening message, so the definition
          // has to carry it.
          initial_events: [{ type: 'user', message: schedule.prompt }],
        },
      });
    }

    return files;
  },
};
