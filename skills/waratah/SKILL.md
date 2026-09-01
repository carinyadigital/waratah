---
name: waratah
description: Build durable AI agents with the waratah framework. Use when creating, editing, or debugging an waratah project — agent instructions, skills, tools, connections, channels, sandboxes, subagents, schedules, or evals.
---

# waratah

waratah is a filesystem-first framework for durable AI agents. An agent is
a directory on disk — instructions, skills, tools, connections, channels,
subagents, and schedules are all files — and waratah compiles and runs it.

## Source of truth

The complete documentation ships inside the `waratah` package. Do not rely on this skill for guidance — always read the bundled docs, which match the installed version exactly:

```
node_modules/waratah/docs/
```

Start with `node_modules/waratah/docs/README.md`. It contains the full
index and recommended reading order. Before writing any waratah code, read the relevant guide there first.

If `waratah` is not installed yet, install it (`npm install waratah`) or scaffold a new agent with `npx waratah init <agent-name>`, then read the bundled docs.
