/**
 * Cursor cloud agents.
 *
 * Not deployed. It exists because a compiler with one target proves nothing
 * about portability: the second renderer is what tells you whether the portable
 * definition is portable or merely Claude-shaped.
 *
 * Cursor allows or disables a tool outright, with no per-tool "ask" policy, so
 * anything other than `allow` on a connector fails the build here rather than
 * being quietly downgraded.
 */
import type { AgentDefinition } from '../load';
import { assertSupported, type Provider, type RenderedFile } from './index';

const MODELS = {
  strong: 'cursor-grok-4.5-high-fast',
  standard: 'cursor-grok-4.5-fast',
  fast: 'cursor-grok-4.5-fast',
} as const;

export const cursor: Provider = {
  id: 'cursor',
  models: MODELS,
  supports: {
    schedules: true,
    urlConnectors: true,
    stdioConnectors: true,
    perConnectorPermissions: false,
    skills: false,
    // Cursor has no coordinator-over-subagents concept, so a roster cannot be
    // expressed at all — not degraded, not flattened, refused outright.
    multiagent: false,
  },

  render(agent: AgentDefinition): RenderedFile[] {
    assertSupported(cursor, agent);

    const overlay = agent.providers?.cursor ?? {};

    return [
      {
        file: 'agent.json',
        content: {
          name: agent.name,
          description: agent.description,
          triggers: agent.schedules.map((s) => ({
            cron: { expression: s.cron, timezone: s.timezone },
          })),
          actions: agent.connectors.map((c) => ({ mcp: { server: { name: c.name } } })),
          prompts: [{ prompt: agent.instructions }],
          model: MODELS[agent.model],
          memoryEnabled: overlay.memory ?? false,
          disabledDefaultTools: [],
          scope: overlay.scope ?? 'private',
        },
      },
    ];
  },
};
