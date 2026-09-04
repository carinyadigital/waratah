---
title: "Instructions"
description: "Set the agent's standing prompt with markdown files listed on createAgent."
---

Instructions add context without waiting for a person or trigger to send it. waratah loads each listed file as a system-role message at the start of a turn.

## Author instructions

At minimum, instructions are a markdown file beside `agent.ts`. Whatever you write is the prompt:

```md
You are a concise assistant. Use tools when they are available.
```

Keep this file to stable behavior such as identity, tone, and standing rules.

List every instruction file on `createAgent`. Discovery does not infer `instructions.md` from the directory:

```ts
export default createAgent({
  name: "daily-changes",
  model: "anthropic/claude-opus-4.8",
  instructions: ["./instructions.md"],
  tools: [],
  subagents: [],
  channels: [],
});
```

Paths are relative to the directory that contains `agent.ts`. They must stay inside the authored agent root. Absolute paths and paths that escape that root fail compile with `INVALID_AGENT`.

You can list more than one file. Each file becomes its own system message, prefixed with `Instructions (<path>):`, in the order discovery returns (sorted by path). Missing instruction paths fail compile; they are not optional.

There is no `instructions.ts` helper and no user-role instruction slot. Put typed behavior in a [tool](./tools/overview.md), not in the prompt file.

## Instructions vs skills vs memory

These all feed text toward the model. The difference is what waratah does with them today:

| Source | When it loads | What the model sees |
| ------ | ------------- | ------------------- |
| Instructions | Every turn, from the listed files | Full file contents as system messages |
| Project `AGENTS.md` | Every turn, from the workspace | Full file contents as `Project guidance` system messages |
| Memory files | Every turn, from declared memory sources | Full contents, capped at 200 lines or 25 KB. See [Memory](./memory/overview.md) |
| `skills/` | Every turn | A list of discovered skill **paths**, not the skill bodies |

Keep instructions short and stable. Long or situational procedures belong in [skills](./skills.md) once those bodies are loaded on demand. Until then, anything the model must follow on every turn still belongs in instructions.

## Disclaimer

As the deployer, it is your responsibility to ensure your agent complies with applicable laws.

Where a waratah agent communicates with people, you may be required to disclose that they are interacting with an automated AI system where law requires it. waratah does not add this disclosure automatically; configure it in your instructions and outbound tools.

## What to read next

- [Tools](./tools/overview.md): typed actions, the next capability to add
- [Skills](./skills.md): packaged procedures discovered beside the agent
- [Memory](./memory/overview.md): `AGENTS.md` and `MEMORY.md` loaded at session start
- [Agents](./agent-config.md): where instruction paths are declared
