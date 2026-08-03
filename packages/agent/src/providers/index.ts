/**
 * The provider registry.
 *
 * A provider declares what it can express and renders the portable definition
 * into its host's native format. When a definition uses something the provider
 * cannot express, the build FAILS. Not a warning, not a silent drop: a silent
 * degradation is how provider agnosticism becomes a claim nobody can check.
 */
import type { AgentDefinition } from '../load';
import { claude } from './claude';
import { cursor } from './cursor';

export class UnsupportedFeatureError extends Error {
  constructor(provider: string, feature: string, remedy: string) {
    super(`${provider} cannot express ${feature}. ${remedy}`);
  }
}

export interface RenderedFile {
  /** Path under dist/<provider>/ */
  file: string;
  content: unknown;
}

export interface Provider {
  id: string;
  /** Tier to a real model id. Recorded in the output so a tier never hides what shipped. */
  models: Record<AgentDefinition['model'], string>;
  supports: {
    schedules: boolean;
    urlConnectors: boolean;
    stdioConnectors: boolean;
    perConnectorPermissions: boolean;
    skills: boolean;
    multiagent: boolean;
  };
  render(agent: AgentDefinition): RenderedFile[];
}

export const providers: Record<string, Provider> = { claude, cursor };

export const providerIds = Object.keys(providers);

export const getProvider = (id: string): Provider => {
  const provider = providers[id];
  if (!provider) {
    throw new Error(`unknown provider "${id}". installed: ${providerIds.join(', ')}`);
  }
  return provider;
};

/** Shared gate every provider runs before rendering. */
export const assertSupported = (provider: Provider, agent: AgentDefinition): void => {
  const { id, supports } = provider;

  if (agent.schedules.length && !supports.schedules) {
    throw new UnsupportedFeatureError(id, `schedules (${agent.schedules.length} declared)`, 'Remove them, or deploy this agent to a provider that runs on a clock.');
  }
  if (agent.skills.length && !supports.skills) {
    throw new UnsupportedFeatureError(
      id,
      `skills (${agent.skills.map((s) => s.name).join(', ')})`,
      'Inline the skill into instructions.md, or drop this provider.',
    );
  }
  if (agent.multiagent && !supports.multiagent) {
    throw new UnsupportedFeatureError(
      id,
      `a multiagent roster (${agent.multiagent.agents.map((a) => a.name).join(', ')})`,
      'This provider cannot express a coordinator roster. Do not declare it in providers: for this agent, or drop this provider for this team.',
    );
  }
  for (const connector of agent.connectors) {
    if (connector.transport.type === 'url' && !supports.urlConnectors) {
      throw new UnsupportedFeatureError(id, `the url connector "${connector.name}"`, 'Use a stdio transport for this provider.');
    }
    if (connector.transport.type === 'stdio' && !supports.stdioConnectors) {
      throw new UnsupportedFeatureError(
        id,
        `the stdio connector "${connector.name}"`,
        'Host it and use a url transport, or reach it over an MCP tunnel.',
      );
    }
  }
  if (!supports.perConnectorPermissions) {
    const restricted = Object.entries(agent.permissions.connectors ?? {}).filter(([, p]) => p !== 'allow');
    if (restricted.length) {
      throw new UnsupportedFeatureError(
        id,
        `per-connector permission (${restricted.map(([n, p]) => `${n}=${p}`).join(', ')})`,
        'This provider allows or disables a tool outright, with nothing in between.',
      );
    }
  }
};
