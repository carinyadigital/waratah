---
title: "Subagents"
description: "Delegate work to a specialist with its own tools, then take back condensed findings only."
---

A declared subagent lives under `agent/subagents/<name>/` and uses the same `createAgent` helper as the lead. Use one when the child needs a different prompt, role, or tool surface from the parent.

The lead delegates through the built-in `task` tool. There is no built-in copy-of-the-lead `agent` tool.

## Declare a subagent

```ts
import { createAgent } from "waratah";

import gitReader from "./tools/git-reader.js";

export default createAgent({
  name: "systems-analyst",
  kind: "subagent",
  model: "fixture-model",
  instructions: ["./instructions.md"],
  tools: [gitReader],
  subagents: [],
  channels: [],
});
```

`kind: "subagent"` is required. The name must match the directory. Import the child into the parent and list it on `subagents`:

```ts
import systemsAnalyst from "./subagents/systems-analyst/agent.js";

export default createAgent({
  name: "daily-changes",
  model: "fixture-model",
  instructions: ["./instructions.md"],
  tools: [slackPost],
  subagents: [systemsAnalyst],
  channels: [],
});
```

Minimum files:

```text
agent/subagents/systems-analyst/
├── agent.ts
├── instructions.md
└── tools/
```

`schedules/` is not supported on a subagent. `channels` must be `[]`. Compile fails with `INVALID_SCHEDULE_SCOPE` or `INVALID_CHANNEL_SCOPE` and leaves the previous manifest untouched.

## The isolation boundary

A declared subagent inherits nothing from the lead's authored slots. It has only the instructions, tools, skills, and memory paths on its own `createAgent` call.

| Slot | Lead | Declared subagent |
| ---- | ---- | ----------------- |
| Instructions | Own listed files | Own listed files |
| Tools | Own listed tools plus `read` / `write` / `list` / `task` | Own listed tools plus `read` / `write` / `list` |
| Skills / memory | Own paths | Own paths |
| Channels | Lead only | Forbidden |
| Schedules | Lead only | Forbidden |
| Conversation | Durable thread | Fresh messages for this `task` call |
| Session files | Shared `files` channel | Shared `files` channel |

The parent transfers data through the `instruction` string it passes to `task`. The child never sees the parent's message list. Do not put secrets in that instruction unless the child and its tools are appropriate for that data.

A model can call only tools bound to the current agent. Give the git reader to the analyst, not to the lead, when the lead must not see raw diffs.

## `task` and findings

`task` is attached to the lead only. Input:

```ts
{
  subagent: string;    // must match a declared child name
  instruction: string; // everything the child needs
}
```

An unknown name fails with `SUBAGENT_NOT_DECLARED`.

The child must write condensed markdown to `/session/<id>/findings/<subagent>.md` before `task` returns success. An empty or missing file fails with `SUBAGENT_FINDING_MISSING`. Findings larger than 32 KiB fail with `PAYLOAD_LIMIT_EXCEEDED`.

On success, the lead receives the finding path and a short summary (at most 1 KiB). It can `read` that path from the shared session filesystem. Raw child transcripts do not return to the lead.

The lead and the child share a step budget for the turn (20 steps, 4 tool calls per step).

## Nesting

Discovery walks nested `subagents/` up to 16 levels for the manifest. Only the lead receives `task`, so a running subagent cannot delegate further through that built-in tool.

## When to split

Split out a subagent when the task needs a specialist role or a narrower tool surface. Don't reach for one when [instructions](../instructions.md) or a [skill](../skills.md) would do.

## What to read next

- [Tools](../tools/overview.md): authored tools and session filesystem tools
- [Sessions](../concepts/sessions.md): where findings land on disk
- [Agents](../agent-config.md): listing children on `createAgent`
