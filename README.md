# agents by carinya digital

`agents` is a portable agent definition, built to any provider.

## The agent directory is authoritive

Define an agent once — identity, instructions, connectors, and schedules — then render it into provider-specific artifacts. Conventional subdirectories are discovered automatically.

```
agents/<my-agent>/
  agent.yaml          identity, model tier, permissions, providers — and, for
                       a coordinator, its roster's name/version pins
  instructions.md     the system prompt
  questions.yaml      optional: pre-registered questions, read at runtime
  connectors/         optional: one MCP server per file
  schedules/          optional: one recurring run per file
  skills/             optional: one skill declaration per file
  subagents/<name>/   optional, one level only: a full agent directory per
                       subagent — same shape as above, minus schedules/ and
                       subagents/ of its own
  dist/               built output (committed so every deploy is a diff)
```

An agent with a `multiagent` block in `agent.yaml` is a coordinator: it names a version-pinned roster, and every entry needs a matching directory under `subagents/` (checked in both directions — an undeclared subagent or a subagent with no matching entry both fail the build). A subagent has no clock of its own, so it declares no `schedules/`; delegation stops at one level, so it declares no `subagents/` either. See [`agents/content-marketer/`](agents/content-marketer/) for a working example, and [`docs/content-marketing-team.md`](docs/content-marketing-team.md) for the design behind it.

Read the [docs](docs/) for the full project layout and guides.

## Deploying your agent

```bash
pnpm run deploy -- --provider claude --dry-run
```

Built artifacts are the API request body, field for field, with one exception: anything account-specific stays a placeholder, because it cannot be known at build time and would make `dist/` unreviewable if it were.

| Placeholder | Resolved at deploy from |
|---|---|
| `${SOME_VAR}` | the environment (endpoints, environment id, vault ids) |
| `${agent:<name>}` | the id of that agent, created earlier in the same run |

`--dry-run` touches nothing, needs no credential, and reports which variables are still unset rather than failing on the first one. A real deploy resolves everything up front, so a missing variable stops the run before anything reaches your account.

Publishing is ordered — subagents, then the coordinator with its roster resolved, then deployments — and idempotent by name: re-running after a partial failure updates what exists instead of creating a second copy. An existing deployment is left alone rather than silently rewritten; archive it and re-run to change a live schedule.

Deploy refuses stale `dist/`, so what ships is always what was reviewed. Every schedule's `prompt` is required — it becomes `initial_events`, since a scheduled run has no one at a keyboard to open it.

## Agent runtime providers

| Provider | Emits | Status |
|---|---|---|
| `claude` | `agent.json` (plus `skills` and `multiagent` where declared) and one `deployments/<schedule>.json` per schedule | Deploy target |
| `cursor` | `agent.json` | Rendered and tested; no publisher, `deploy` refuses it |

`model` is a tier (`strong`, …), not a vendor id — each provider resolves it and records what shipped. Secrets stay literal in `dist/` (e.g. `${ANALYTICS_MCP_URL}`) and resolve at deploy time.

Not every provider expresses every feature — `cursor` has no coordinator concept, so a coordinator's `providers:` block should simply omit a `cursor:` key, and the build skips that combination cleanly rather than rendering something cursor cannot express. Declaring a provider that genuinely can't support what an agent needs (a `multiagent` roster, a stdio connector, per-connector `ask`, skills) still fails the build loudly — never a silent, degraded artifact.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) to get the repo
running locally and land a change, and use
[issues](https://github.com/carinyaparc/carinyaparc/issues) to collaborate. By
participating, you agree to our [Code of Conduct](CODE_OF_CONDUCT.md).

## Licence

`agent` is licensed under the [Apache License 2.0](LICENSE). By contributing,
you agree that your contributions will be licensed under that same license.

(c) Copyright 2026 Carinya Digital Services.
