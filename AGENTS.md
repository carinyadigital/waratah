# AGENTS.md

Carinya Agents — one portable agent definition, built to Claude or Cursor.

## Commands

| Command | Description |
|---------|-------------|
| `pnpm install` | Install deps (CI: `--frozen-lockfile`) |
| `pnpm validate` | Parse and schema-check agent definitions |
| `pnpm build` | Render into `agents/<name>/dist/<provider>/` |
| `pnpm build:check` | Fail if committed `dist/` is stale |
| `pnpm test` | Vitest |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm run deploy -- --provider claude --dry-run` | Verify + report paths (publisher not wired; use `pnpm run` — pnpm has its own `deploy`) |

Node `>=24` (`.nvmrc`: 24). Package manager: `pnpm@11.18.0`.

## Architecture

```
agents/<name>/          portable definition + committed dist/
  agent.yaml            identity, model tier, permissions, provider overlay,
                         and — for a coordinator — multiagent: roster name/version pins
  instructions.md       system prompt
  questions.yaml        pre-registered questions (runtime; not compiled)
  connectors/           one MCP server per file
  schedules/            one run per file (prompt is required — becomes initial_events)
  skills/               one directory per skill, mounted by name (claude only)
  subagents/<name>/     one level only: a full agent dir per subagent —
                         no schedules/, no nested subagents/ of its own
  dist/<provider>/      built artifacts — commit after every definition change
packages/agent/         schema, loaders, providers, CLI
brand/                  positioning.md, voice.md (not copied into dist)
```

Nothing in `agent.yaml` names a vendor. Vendors live in `connectors/` and the provider overlay only.

`agents/content-marketer/` is the first coordinator: a lead with a `multiagent` roster over `subagents/content-analyst` and `subagents/market-researcher`. Design in `docs/content-marketing-team.md`.

## Workflow

- Conventional Commits.
- Changes land via PR review (including `questions.yaml` and agent defs).
- CI on PRs and `main`: validate → build:check → typecheck → test.
- Deploy is `workflow_dispatch` only; dry-run defaults to true. Real publish is not implemented yet.

## Gotchas

- After editing definitions, run `pnpm build` and commit `dist/` — CI and deploy refuse stale output.
- Secrets stay literal in `dist/` (`${ANALYTICS_MCP_URL}`); resolve at deploy, never at build. Same rule for `multiagent`: rendered by name, never an account-specific id, until deploy resolves it.
- `agent.yaml` `name` must equal the directory basename — including for subagents, against their own directory under `subagents/`.
- A subagent that declares `schedules/` or its own `subagents/` fails the build by name — no clock of its own, and delegation stops at one level.
- `multiagent.agents` in `agent.yaml` and the directories under `subagents/` are cross-checked in both directions — an orphan on either side fails the build.
- Build fails hard on unsupported provider features (no silent drop) — e.g. Claude rejects stdio connectors; Cursor rejects per-connector non-`allow`, `skills/`, and any `multiagent` roster.
- A coordinator should simply not declare a `cursor:` key under `providers:` — the build then skips that combination instead of hitting the (still-enforced) failure above.
- `questions.yaml` and `brand/` are not part of the compiler.
- Without `--dry-run`, `deploy` exits with “no publisher wired”.

## Boundaries

- Never: read, commit, or echo values from `.env`, `.env*.local`, `*.pem`, or live secret values; leave `${VAR}` placeholders in `dist/`.
- Ask first: before a non-dry-run deploy or changing GitHub Environment secrets (`ANTHROPIC_API_KEY`, `ANALYTICS_MCP_URL`).
