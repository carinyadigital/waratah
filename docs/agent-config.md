---
title: "Agents"
description: "Configure a waratah agent's name, model, instructions, tools, subagents, and related paths in agent.ts."
---

A waratah app has one lead agent assembled from the files under `agent/`. Its `agent.ts` calls `createAgent` (from `waratah`) and must be the default export. Declared [subagents](./subagents/index.md) have their own `agent.ts` and capabilities; this page covers the configuration shared by leads and subagents.

## Set identity and the model

A typical config selects a name and a model:

```ts
import { createAgent } from "waratah";

export default createAgent({
  name: "daily-changes",
  model: "anthropic/claude-opus-4.8",
  instructions: ["./instructions.md"],
  tools: [],
  subagents: [],
  channels: [],
});
```

`name` is required. It must be a single path-safe segment: letters, numbers, underscores, and hyphens. For a subagent, the name must match the directory under `subagents/` (`agent/subagents/systems-analyst/agent.ts` → `"systems-analyst"`).

`kind` defaults to `"lead"`. Nested specialists must pass `kind: "subagent"`. The compiler rejects a declared child whose `kind` is not `"subagent"`.

`model` is a required non-empty string. waratah stores it on the definition and in `.waratah/manifest.json`. It does not install a provider SDK or read an API key. The harness calls whichever `ModelAdapter` the running process supplies. Tests use a fake adapter. `waratah serve` does not invoke a model.

Choose a model, provider, and trigger path that meet your data-processing and compliance requirements.

## Instructions, skills, and memory paths

`instructions` is a required list of relative paths. Each path is resolved from the directory that contains `agent.ts` and must stay inside the authored agent root. See [Instructions](./instructions.md).

`skills` is optional:

- Omit it to discover `./skills/` beside `agent.ts`.
- Pass an empty array to disable skills.
- Pass extra relative directories when you need more than the default slot.

`memory` is optional:

- Omit it to use the project `.waratah/memory/` directory.
- Pass an empty array to disable memory.
- Pass extra relative files or directories for additional scratchpads.

Project `AGENTS.md` is never listed on `createAgent`. The harness loads it from the workspace at session start. See [Memory](./memory/overview.md).

Absolute content paths fail compile. Paths that escape the authored agent (or, for default memory, the project memory directory) fail compile.

## Tools, subagents, channels, and schedules

`tools` is required. List every authored `defineTool` this agent may call. Placing a file under `tools/` does not grant the capability. Built-in names `read`, `write`, `list`, and `task` are reserved. See [Tools](./tools/overview.md).

`subagents` is required. List imported child `createAgent` definitions, or pass `[]`. Each child must live at `subagents/<name>/agent.ts` relative to the parent. See [Subagents](./subagents/index.md).

`channels` is required. Only a lead may declare channels. There is no public `defineChannel` helper yet, so pass `channels: []`. A subagent with a non-empty `channels` list fails compile with `INVALID_CHANNEL_SCOPE` and leaves the previous manifest untouched.

`schedules` is optional on a lead and defaults to `[]`. List imported `defineSchedule` values. A subagent that declares schedules, or that contains a `schedules/` directory, fails compile with `INVALID_SCHEDULE_SCOPE`. See [Schedules](./schedules.md).

## `createAgent` fields

| Field | Required | Default | Description |
| ----- | -------- | ------- | ----------- |
| `name` | Yes | — | Path-safe agent identity. |
| `kind` | No | `"lead"` | `"lead"` or `"subagent"`. |
| `model` | Yes | — | Model identifier string. |
| `instructions` | Yes | — | Relative instruction file paths. |
| `skills` | No | `["./skills/"]` | Skill directories. `[]` disables. |
| `memory` | No | `[".waratah/memory/"]` | Memory sources. `[]` disables. |
| `tools` | Yes | — | Authored tools this agent may call. |
| `subagents` | Yes | — | Declared child agents. |
| `channels` | Yes | — | Lead-only inbound surfaces. Pass `[]` today. |
| `schedules` | No | `[]` | Lead-only `defineSchedule` values. |

An invalid definition throws `WaratahError` with code `INVALID_AGENT` before compile writes a manifest.

## Where adjacent settings live

| Concern | Lives in |
| ------- | -------- |
| Instructions prompt | listed files, [Instructions](./instructions.md) |
| Typed actions | `defineTool`, [Tools](./tools/overview.md) |
| Specialist children | `subagents/<name>/`, [Subagents](./subagents/index.md) |
| Cadence jobs | `schedules/`, [Schedules](./schedules.md) |
| Session files and HTTP trigger | [Sessions](./concepts/sessions.md) |

## What to read next

- [TypeScript API](./reference/typescript-api.md) for exported types
- [Getting Started](./getting-started.md) for the filesystem layout
- [CLI](./reference/cli.md) for `waratah build` and `waratah info`
