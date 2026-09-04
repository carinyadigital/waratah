---
title: "Schedules"
description: "Author cadence jobs under agent/schedules/ with defineSchedule. Cron is the expression, not a channel."
---

A schedule is a cadence job, not a channel. Authors put jobs under `agent/schedules/` and list them on `createAgent`. waratah fires each job through a framework-owned schedule adapter. You never construct that adapter, and you do not put schedules in `agent/channels/`.

## Author a schedule

Export `defineSchedule` as the default from a TypeScript file under the lead's `schedules/` directory. The schedule name is the file path, not a `name` field: `agent/schedules/daily-changes.ts` is `daily-changes`.

```ts
import { defineSchedule } from "waratah";

export default defineSchedule({
  cron: "0 8 * * *",
  markdown:
    "Analyze repository changes for the last 24 elapsed hours on the configured repository and branch.",
});
```

`cron` is the cadence expression. `markdown` is the session message when that job fires.

Import the schedule in `agent.ts` and list it. Omitting `schedules` means none.

```ts
import { createAgent } from "waratah";
import dailyChanges from "./schedules/daily-changes";

export default createAgent({
  name: "daily-changes",
  model: "anthropic/claude-opus-4.8",
  instructions: ["./instructions.md"],
  tools: [],
  subagents: [],
  channels: [],
  schedules: [dailyChanges],
});
```

Only a lead may author schedules. A subagent that declares `schedules` or that contains a `schedules/` directory fails compile with `INVALID_SCHEDULE_SCOPE` and leaves the previous manifest untouched.

## How a fire becomes a session

The framework does not host a scheduler. A deployment scheduler (cron, systemd, a cloud job) should `POST /session` with a stable `deliveryId` and a message — typically the same markdown the schedule file declares. See [Sessions](./concepts/sessions.md).

`waratah serve` is that HTTP trigger. It records `trigger: "http"`. In-process tests fire the authored job through the framework-owned schedule adapter (`trigger: "schedule"`). Authors never construct that adapter. `defineSchedule` is the only schedule helper exported from `waratah`.

The same `deliveryId` again is a duplicate and does not start a second session.

The adapter does not compute a lookback window. If the agent needs `since` / `until`, put that in the markdown, the HTTP body, or an authored tool such as `git-reader`.

`waratah info` prints declared schedules from `.waratah/manifest.json`.

## Schedules vs channels

| | Schedule | Channel |
| - | -------- | ------- |
| Authoring path | `agent/schedules/*.ts` | `agent/channels/*.ts` (none public yet; pass `channels: []`) |
| What it names | When the agent acts | Which inbound surface accepted the trigger |
| Session trigger | `"schedule"` (in-process adapter) | `"http"` or a named channel |
| Cadence field | `cron` on `defineSchedule` | not a channel |

## What to read next

- [Agents](./agent-config.md) for the `schedules` field on `createAgent`
- [Getting Started](./getting-started.md) for the filesystem layout
- [Architecture](../ARCHITECTURE.md) for the runtime adapter
