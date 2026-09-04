---
title: "Schedules"
description: "Declare a lead-only cron job whose markdown prompt opens a session when the schedule fires."
---

A schedule starts the agent on its own clock instead of waiting for an inbound HTTP body. Use one for a daily digest or any other cadence job. Only a **lead** may author schedules. Declared subagents cannot have a `schedules/` directory or a non-empty `schedules` list.

The name comes from the path under `schedules/` (`agent/schedules/daily-changes.ts` → `"daily-changes"`). There is no `name` field on the definition.

## `defineSchedule`

Every schedule provides a cron expression and a markdown prompt:

```ts
import { defineSchedule } from "waratah";

export default defineSchedule({
  cron: "0 8 * * *",
  markdown:
    "Analyze repository changes for the last 24 elapsed hours on the configured repository and branch.",
});
```

`defineSchedule` checks that both strings are non-empty. It does not interpret the cron expression. Cron is the expression, not an adapter. Authored code never constructs the framework's schedule adapter.

There is no `run` handler form. Delivery to Slack or another system is an authored [tool](./tools/overview.md) the agent calls during the turn, not a schedule callback.

A markdown `.md` file under `schedules/` can appear as a name in the manifest. Authoring and listing a TypeScript `defineSchedule` default export is the supported path.

## Attach it to the lead

Import the schedule and list it on `createAgent`. Discovery also walks `./schedules/` beside `agent.ts` to record names in `.waratah/manifest.json`:

```ts
import dailyChanges from "./schedules/daily-changes.js";

export default createAgent({
  name: "daily-changes",
  model: "fixture-model",
  instructions: ["./instructions.md"],
  tools: [slackPost],
  subagents: [systemsAnalyst],
  channels: [],
  schedules: [dailyChanges],
});
```

Omit `schedules` when the lead has none.

## What fires a schedule

When a tick is dispatched, waratah opens a session with `trigger: "schedule"` and the schedule's markdown as the user message. `deliveryId` is supplied by the tick so retries dedup onto the same session. See [Sessions](./concepts/sessions.md).

`waratah serve` does **not** evaluate cron or dispatch ticks. It only accepts `POST /session` on loopback. Running a cadence is the caller's process (your host's cron, a queue, or a test that posts a session with the same markdown). The CLI will not start a daily job by itself.

## Session continuity

Each fire should use a new `deliveryId`. Reusing an id returns `duplicate` and does not run again. Store facts that must survive across fires outside the per-run session directory.

## What to read next

- [Sessions](./concepts/sessions.md): `deliveryId`, inspectable session files
- [Subagents](./subagents/index.md): typical work a scheduled lead delegates
- [CLI](./reference/cli.md): `waratah serve` as a local HTTP trigger
