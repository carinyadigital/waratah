---
title: "waratah Public Docs"
description: "Index of published docs for app authors using waratah as a framework."
---

# waratah public docs

This folder is for app authors using waratah as a framework.

If you want to understand how to build agents with waratah, start here.

Important naming note:

- The framework is called waratah.
- The published package name is `waratah`.
- The CLI binary is `waratah`.

These pages describe **what is live in the package and CLI today**. Architecture notes that mention connections, sandboxes, ACP, evals, streaming, or human interrupts are not documented here until those surfaces ship.

## Find the page for your task

| To do this | Read this |
| ---------- | --------- |
| Create a project, or understand the file layout | [Getting Started](./getting-started.md) |
| Set the model, tools, or other agent-wide config | [Agents](./agent-config.md) |
| Change what the agent does and how it behaves | [Instructions](./instructions.md) |
| Package a procedure discovered beside the agent | [Skills](./skills.md) |
| Carry `AGENTS.md` or `MEMORY.md` into a turn | [Memory](./memory/overview.md) |
| Give the agent a typed capability it can call | [Tools](./tools/overview.md) |
| Delegate work to a specialist child agent | [Subagents](./subagents/index.md) |
| Run work on a recurring schedule | [Schedules](./schedules.md) |
| Open a durable session over HTTP | [Sessions](./concepts/sessions.md) |
| Look up a CLI command or an exported type | [CLI](./reference/cli.md), [TypeScript API](./reference/typescript-api.md) |
| Review deployer obligations | [Responsible Use](./responsible-use.md) |

## Legal and safeguards

waratah is in preview; the framework, APIs, documentation, and behavior may change before general availability.

As the deployer, it is your responsibility to ensure your agent complies with applicable laws.

You are responsible for tool restrictions, secrets handling, and any human gate your use case needs. The default approval policy permits every valid tool call. `waratah serve` is loopback-only. Read [Responsible Use](./responsible-use.md) before using waratah with non-public or production data.

## Read this first

For a full picture rather than a single task, read in this order:

1. [Getting Started](./getting-started.md)
2. [Agents](./agent-config.md)
3. [TypeScript API](./reference/typescript-api.md)
4. [Instructions](./instructions.md)
5. [Skills](./skills.md)
6. [Tools](./tools/overview.md)
7. [Subagents](./subagents/index.md)
8. [Schedules](./schedules.md)
9. [Memory](./memory/overview.md)
10. [Sessions](./concepts/sessions.md)
11. [CLI](./reference/cli.md)

## The public mental model

waratah is a filesystem-first framework for durable backend agents.

You author an agent as files on disk:

- instructions listed from `agent.ts`
- optional procedures in `skills/`
- typed integrations listed as `defineTool` values
- specialist child agents in `subagents/`
- recurring jobs in `schedules/`
- additive runtime config in `agent.ts` via `createAgent`

Authors never import `@langchain/langgraph`.

waratah then gives you:

- `waratah build` → `.waratah/manifest.json` and a compiled graph
- `waratah info` → an inspectable report of that graph
- `waratah serve` → loopback `POST /session` with durable session identity
- a per-run inspectable directory under `.waratah/session/<id>/`
- built-in session filesystem tools and lead-only `task`

It does not yet give you channel webhooks, a client SDK, a sandbox, MCP connections, evals, or a public streaming route.

## The runtime shape

The public surface stays filesystem-first, but the implementation model underneath is still useful to know:

- HTTP (and in-process schedule dispatch) normalize a trigger into a session and a message
- the harness does one unit of AI work: model, tools, optional `task`, then stop
- the runtime persists thread state in a checkpointer and writes inspectable session files

The default HTTP API exposes one durable `sessionId` (the `deliveryId`) for accept and duplicate detection. Follow-up turns, streams, and cancel are not served.

## How to use these docs

- Start with the authored filesystem shape and `agent.ts`.
- Then add runtime surfaces in this order: instructions, skills, tools, subagents, schedules.
- Then learn the durable trigger model: `POST /session`, session files, and cadence identity.
- Use the CLI and TypeScript pages as lookup, not as the first read.

Runtime layout and module ownership live in [`ARCHITECTURE.md`](../ARCHITECTURE.md). When the two disagree, treat the code and these pages as what ships, and update architecture in the same change that lands a new surface.
