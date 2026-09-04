---
title: "Getting Started"
description: "Install waratah, understand the agent filesystem layout, compile a project, and accept a local session."
---

## Prerequisites

You need:

- Node.js 24 or newer
- npm, which Node.js includes (or pnpm, if you are working in this repository)

waratah is in preview. The package, APIs, documentation, and behavior may change before a 1.0 release. Authors call `createAgent`; they never import `@langchain/langgraph`.

## Install

There is no scaffold command. Add the package to a Node.js project:

```bash
npm install waratah
```

Declare Node.js 24 in `package.json`, then create `agent/agent.ts` and `agent/instructions.md`.

If you are contributing to this repository, clone it and install the workspace instead:

```bash
git clone https://github.com/carinyadigital/waratah.git
cd waratah
pnpm install
```

The in-repo fixture at [`examples/daily-changes/`](https://github.com/carinyadigital/waratah/tree/main/examples/daily-changes) is a complete authored agent you can compile without live model, GitHub, or Slack credentials.

## Project layout

waratah builds an agent by walking the filesystem under `agent/`. `agent.ts` is required: identity (model, tools, channels, schedules, subagents, and any skill or memory path overrides) is stated there rather than inferred from whatever files happen to sit in a directory.

### Recommended layout

```text
my-agent/
├── package.json
├── agent/
│   ├── agent.ts
│   ├── instructions.md
│   ├── skills/<skill>/SKILL.md
│   ├── tools/*.ts
│   ├── schedules/*.ts
│   └── subagents/<name>/
│       ├── agent.ts
│       ├── instructions.md
│       └── tools/*.ts
└── .waratah/                 # compile output and local session files (gitignored)
```

Markdown is the default for prompts and procedures. TypeScript is used where behaviour needs types or execution.

### Agent files and directories

Each path under `agent/` has a specific purpose. A **lead** is the root agent. A **subagent** is the same `createAgent(...)` shape nested under `subagents/<name>/`. Subagents can use only the paths marked **Yes**.

| Path | Use | Available to subagents | Notes |
| ---- | --- | ---------------------- | ----- |
| `agent.ts` | Runtime config | Yes | `createAgent({ name, model, instructions, tools, subagents, channels, … })`. Required. See [Agents](./agent-config.md). |
| `instructions.md` (or other listed files) | System prompt | Yes | Paths are listed on `createAgent`. See [Instructions](./instructions.md). |
| `skills/` | Packaged procedures | Yes | Omit `skills` to discover `./skills/` beside `agent.ts`. An empty array disables skills. See [Skills](./skills.md). |
| `tools/*.ts` | Typed integrations | Yes | A file on disk is not enough; list each tool on `createAgent`. See [Tools](./tools/overview.md). |
| `schedules/*.ts` | Recurring jobs | No | Lead only. Name comes from the file path. See [Schedules](./schedules.md). |
| `subagents/<name>/` | Specialist child agents | Yes | Nested `createAgent` with `kind: "subagent"`. See [Subagents](./subagents/index.md). |
| `channels` on `createAgent` | Inbound surfaces | No | Lead only. There is no `defineChannel` helper yet; pass `channels: []`. |

Paths that appear in architecture notes but are not a live authoring surface — `connections/`, `hooks/`, `sandbox/` — are not loaded today. Do not author them expecting the compiler to bind them.

### Naming from paths

Schedule names come from the file path, not from a `name` field:

| Path | Resolves to |
| ---- | ----------- |
| `agent/schedules/daily-changes.ts` | schedule `daily-changes` |
| `agent/subagents/systems-analyst/agent.ts` | subagent `systems-analyst` |

Tool names are the `name` you pass to `defineTool`. Agent names must be a single path-safe segment: letters, numbers, underscores, and hyphens.

## Author the root agent

A minimal lead looks like this:

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

`model` is a string identifier stored on the definition and in the manifest. The CLI does not call a model provider. Turns that invoke the harness supply a `ModelAdapter` in process (tests use a fake). Choose a model id that matches the adapter you will wire in your own process.

Omit `skills` to discover `./skills/` relative to `agent.ts`. Omit `memory` to use the project `.waratah/memory/` directory. Omit `schedules` when the lead has none; list imported `defineSchedule` values when it runs on a cadence.

```md
You are a concise assistant. Prefer tools when they are available.
```

Export `createAgent(...)` as the default from `agent/agent.ts`. `waratah build` imports that file.

## Compile and inspect

From the project root (the directory that contains `agent/`):

```bash
npx waratah build
npx waratah info
```

In this repository:

```bash
pnpm waratah build examples/daily-changes
pnpm waratah info examples/daily-changes
```

`waratah build` imports `agent/agent.ts`, walks declared subagents, and writes `.waratah/manifest.json`. Compile fails with every diagnostic in one run and leaves the previous manifest untouched. The manifest is inspectable compile output, not an authoring API.

`waratah info` prints the lead, tools, channels, schedules, and nested subagents from an existing manifest. Run it when discovery does not match what you expected.

## Accept a local session

`waratah serve` binds the loopback HTTP trigger:

```bash
npx waratah serve --port 3000
```

It prints a JSON line such as `{"status":"listening","host":"127.0.0.1","port":3000}`. The server listens on `127.0.0.1` only.

```bash
curl -sS -X POST http://127.0.0.1:3000/session \
  -H 'Content-Type: application/json' \
  -d '{"deliveryId":"delivery-one","triggeredAt":"2026-09-04T00:00:00.000Z","message":"Produce today'\''s digest."}'
```

A new `deliveryId` returns `202` with `{ "status": "accepted", "sessionId": "delivery-one" }`. The same `deliveryId` again returns `202` with `status: "duplicate"` and does not open a second session. `sessionId` equals `deliveryId`.

`waratah serve` accepts the trigger and writes the inspectable session directory. It does not run the model/tool loop. See [Sessions](./concepts/sessions.md) for the request body, status codes, and files under `.waratah/session/`.

## Continue from here

| Goal | Read |
| ---- | ---- |
| Set the model, tools, or subagents on `createAgent` | [Agents](./agent-config.md) |
| Change what the agent does | [Instructions](./instructions.md) |
| Give the agent a typed capability | [Tools](./tools/overview.md) |
| Delegate work to a specialist | [Subagents](./subagents/index.md) |
| Run work on a cadence | [Schedules](./schedules.md) |
| Look up a CLI command or an exported type | [CLI](./reference/cli.md), [TypeScript API](./reference/typescript-api.md) |
