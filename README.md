# Carinya Agents

One portable agent definition, built to whatever provider it is deployed to.

An agent is a directory. `agent.yaml` carries identity, model tier, permissions and per-provider overlay. `instructions.md` is the system prompt. Everything else is discovered from conventional subdirectories, the way a skill or a plugin works: adding a connector is adding a file, never editing a list in two places.

```
agents/content-analyst/
  agent.yaml          identity, model, permissions, providers
  instructions.md     the system prompt
  questions.yaml      pre-registered questions, changed by reviewed diff
  connectors/         one MCP server per file
  schedules/          one run per file
  dist/               built output, committed so every deploy is a diff
packages/agent/       schema, providers, build
brand/                positioning.md, voice.md
```

Nothing in `agent.yaml` names a vendor. Vendors appear in `connectors/` and the provider overlay, and nowhere else.

## Commands

```bash
pnpm install
pnpm validate        # definitions parse and conform
pnpm build           # render into agents/<name>/dist/<provider>/
pnpm build:check     # fail if dist/ is stale
pnpm test
pnpm typecheck
pnpm deploy --provider claude --dry-run
```

## Providers

| Provider | Emits | Status |
|---|---|---|
| `claude` | `agent.json` plus one `deployments/<schedule>.json` per schedule | Deploy target |
| `cursor` | `agent.json` | Rendered and tested, not deployed |

Claude Managed Agents has two concepts, so the build emits two artifacts: an agent (model, system prompt, tools, MCP servers) created once and referenced by id, and a scheduled deployment carrying POSIX cron plus an IANA timezone.

Cursor exists because a compiler with one target proves nothing about portability. The second renderer is what tells you whether the definition is portable or merely Claude-shaped.

## Rules the build enforces

**It fails when a provider cannot express something.** Not a warning, not a silent drop. Silent degradation is how provider agnosticism becomes a claim nobody can check. A stdio connector on Claude fails with a pointer to MCP tunnels; per-connector `ask` on Cursor fails because Cursor allows or disables a tool outright.

**`model` is a tier**, not an id. Each provider resolves `strong` to a real model and writes the tier into the artifact's metadata, so a tier never hides what shipped.

**Secrets stay literal in `dist/`.** `${ANALYTICS_MCP_URL}` is resolved at deploy, never at build, so built output is deterministic, reviewable, and free of endpoints and tokens. An unset variable fails the deploy rather than shipping an empty string.

**`deploy` refuses stale output.** What ships is what was reviewed.

## Before the first deploy

`connectors/analytics.yaml` points at `${ANALYTICS_MCP_URL}`. The official Google Analytics MCP server ships as a local stdio process, so it has to be hosted before a managed agent can reach it: deploy it to Cloudflare Workers and set that endpoint as a repository secret alongside `ANTHROPIC_API_KEY`.

The `deploy` command renders and verifies but has no publisher wired yet. `--dry-run` reports what would ship.
