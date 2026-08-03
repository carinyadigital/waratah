/**
 * Claude Managed Agents.
 *
 * Two artifacts, because the platform has two concepts: an agent (model, system
 * prompt, tools, MCP servers, skills) created once and referenced by id, and a
 * scheduled deployment (POSIX cron plus an IANA timezone) that starts sessions
 * against it.
 *
 * What is rendered here is the API request body, field for field, with one
 * exception: anything account-specific stays a placeholder.
 *
 *   ${SOME_VAR}         an environment variable, resolved by deploy
 *   ${agent:<name>}     an agent id, resolved by deploy once that agent exists
 *
 * Neither can be known at build time, and both would make dist/ non-portable
 * and non-reviewable if they were. Deploy resolves them immediately before
 * POSTing; build stays deterministic.
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

/** Deploy substitutes the created agent's id. Lowercase, so it never collides with a ${ENV_VAR}. */
export const agentRef = (name: string) => `\${agent:${name}}`;

const vaultRef = (name: string) => `\${VAULT_ID_${name.toUpperCase().replace(/-/g, '_')}}`;

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
        type: 'url',
        name: c.name,
        url: (c.transport as { type: 'url'; url: string }).url,
      })),
      // Every mcp_servers entry needs a matching mcp_toolset and vice versa —
      // the API rejects both unreferenced servers and dangling toolsets.
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
      ...(agent.skills.length
        ? {
            skills: agent.skills.map((s) => ({
              type: s.type,
              skill_id: s.skill_id,
              ...(s.version ? { version: s.version } : {}),
            })),
          }
        : {}),
      // Roster entries are {type, id} — there is no name-based reference in
      // the API. The id is account-specific, so it is a placeholder here and
      // deploy fills it in from the agents it created earlier in the same run.
      ...(agent.multiagent
        ? {
            multiagent: {
              type: agent.multiagent.type,
              agents: agent.multiagent.agents.map((a) => ({
                type: 'agent',
                id: agentRef(a.name),
                version: a.version,
              })),
            },
          }
        : {}),
      metadata: {
        source: agent.source,
        model_tier: agent.model,
      },
    };

    const files: RenderedFile[] = [{ file: 'agent.json', content: definition }];

    for (const schedule of agent.schedules) {
      files.push({
        file: `deployments/${schedule.name}.json`,
        content: {
          name: `${agent.name}-${schedule.name}`,
          agent: agentRef(agent.name),
          // Required on every deployment. A literal id if the definition
          // pinned one, otherwise a placeholder — never absent, because the
          // API has no account default to fall back on.
          environment_id: overlay.environment ?? '${CLAUDE_ENVIRONMENT_ID}',
          ...(overlay.vaults?.length ? { vault_ids: overlay.vaults.map(vaultRef) } : {}),
          // A scheduled run has no human at a keyboard, so the message that
          // opens the session is part of the definition.
          initial_events: [
            { type: 'user.message', content: [{ type: 'text', text: schedule.prompt }] },
          ],
          schedule: { type: 'cron', expression: schedule.cron, timezone: schedule.timezone },
        },
      });
    }

    return files;
  },
};
