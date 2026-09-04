<div align="center">
  <a href="https://carinyadigital.com/waratah">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset=".github/assets/waratah.svg">
      <img alt="waratah" src=".github/assets/waratah.svg" width="128" height="128">
    </picture>
  </a>
  <h1>waratah</h1>
</div>

waratah is a filesystem-first TypeScript harness for durable AI agents. An
agent is a directory on disk — instructions, skills, tools, connections,
channels, hooks, sandbox, and nested subagents are files — and waratah
compiles that directory to a LangGraph `CompiledStateGraph` and runs it.
Authors call `createAgent`; they never import `@langchain/langgraph`.

Requires Node.js 24+. Install with `npm install waratah`.

## CLI

```bash
pnpm waratah build examples/daily-changes
pnpm waratah info examples/daily-changes
pnpm waratah serve examples/daily-changes
```

The daily-changes fixture at [`examples/daily-changes/`](examples/daily-changes/)
is the Phase 1 path: a PM lead, one systems-analyst subagent, cron, and
`POST /session`. It does not call live models, GitHub, or Slack.

Local `waratah serve` writes one inspectable directory per session under
`.waratah/session/<id>/`. LangGraph resume stays in `.waratah/sessions.db`.

## The agent directory

```
agent/
├── agent.ts                 # createAgent({ model, tools, subagents, … })
├── instructions.md          # system prompt
├── skills/<skill>/SKILL.md  # Agent Skills (agentskills.io)
├── tools/*.ts               # typed tools this agent calls directly
├── channels/*.ts            # LEADS ONLY — trigger entry points
├── connections/*.ts         # MCP / OpenAPI clients this agent talks to
├── hooks/*.ts               # lifecycle hooks (e.g. confidence-gate)
├── sandbox/sandbox.ts       # override — write-capable workers only
└── subagents/<name>/        # nested, same shape, recursively
    ├── agent.ts
    ├── instructions.md
    └── skills/<skill>/SKILL.md
```

```ts
import { createAgent } from "waratah";
import exploration from "./subagents/exploration/agent";

export default createAgent({
  name: "exploration-lead",
  model: "anthropic/claude-opus-4.8",
  skills: ["./skills/", "../shared/skills/"], // optional; omit for ./skills/ only
  memory: [".waratah/memory/", "./notes/MEMORY.md"], // optional; omit for .waratah/memory/ only
  tools: [...],
  subagents: [exploration],
});
```

Read [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full layout and runtime model.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) to get the repo
running locally and land a change, and use
[issues](https://github.com/carinyaparc/carinyaparc/issues) to collaborate. By
participating, you agree to our [Code of Conduct](CODE_OF_CONDUCT.md).

## Licence

`waratah` is licensed under the [Apache License 2.0](LICENSE). By contributing,
you agree that your contributions will be licensed under that same license.

(c) Copyright 2026 Carinya Digital Services.
