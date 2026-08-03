# agents by carinya digital

`agents` is a portable agent definition, built to any provider.

## The agent directory is authoritive

Define an agent once — identity, instructions, connectors, and schedules — then render it into provider-specific artifacts. Conventional subdirectories are discovered automatically.

```
agents/<my-agent>/
  agent.yaml          identity, model tier, permissions, providers
  instructions.md     the system prompt
  questions.yaml      optional pre-registered questions
  tools/              Optional: typed tools the agent use
  connectors/         Optional: mcp servers and adapters
  schedules/          Optional: task schedules
  dist/               built output (committed so every deploy is a diff)
```

Read the [docs](docs/) for the full project layout and guides.

## Deploying your agent

```bash
pnpm deploy --provider claude --dry-run
```

`--dry-run` renders and reports without publishing. Deploy refuses stale `dist/`.

## Agent runtime providers

| Provider | Emits | Status |
|---|---|---|
| `claude` | `agent.json` plus one `deployments/<schedule>.json` per schedule | Deploy target |
| `cursor` | `agent.json` | Rendered and tested; not deployed |

`model` is a tier (`strong`, …), not a vendor id — each provider resolves it and records what shipped. Secrets stay literal in `dist/` (e.g. `${ANALYTICS_MCP_URL}`) and resolve at deploy time.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) to get the repo
running locally and land a change, and use
[issues](https://github.com/carinyaparc/carinyaparc/issues) to collaborate. By
participating, you agree to our [Code of Conduct](CODE_OF_CONDUCT.md).

## Licence

`agent` is licensed under the [Apache License 2.0](LICENSE). By contributing,
you agree that your contributions will be licensed under that same license.


(c) Copyright 2026 Carinya Digital Services.