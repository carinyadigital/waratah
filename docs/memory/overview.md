---
title: "Memory"
description: "What waratah injects at session start from AGENTS.md and MEMORY.md."
---

Memory here means filesystem context that outlives a single message: project conventions and an optional scratchpad. It is not a vector store and not a cross-run Postgres table.

At the start of a turn, the harness loads three kinds of files, then builds system messages. See [Instructions](../instructions.md) for how those messages sit next to the authored prompt.

## Project conventions — `AGENTS.md`

Git-tracked markdown already on the workspace. Ownership, layout, review rules, "never do X." Agents read it; waratah does not append learnings to it.

The harness walks the project root for files named `AGENTS.md`, including nested files along the tree. It skips `.git`, `node_modules`, and `.waratah`. Missing files are skipped. Each file becomes a system message prefixed with `Project guidance (<path>):`.

You never list `AGENTS.md` on `createAgent`. It is loaded because it lives on the repo.

## Auto memory — `MEMORY.md`

Agent-written scratchpad for corrections, preferences, and recurring patterns. Omit `memory` on `createAgent` to use the project `.waratah/memory/` directory. That default may be missing. Pass `memory: []` to disable it. Pass extra relative files or directories for additional sources confined to the authored agent root.

The default file is `.waratah/memory/MEMORY.md`. Across git worktrees, waratah resolves the main worktree's memory directory so the scratchpad is project-scoped, not worktree-scoped. Hostile or malformed `.git` pointer files fall back to the current project's file.

Each memory file is injected as a system message prefixed with `Memory (<path>):`. Contents are capped at **200 lines or 25 KB**. Over-budget files are truncated at load time and gain a visible marker:

```text
[waratah: MEMORY.md truncated to 200 lines / 25 KB]
```

waratah does not write or compact `MEMORY.md` for you. If the agent should update the scratchpad, that is an authored [tool](../tools/overview.md) or a human edit. Do not treat this file as a secrets store.

## What is not memory

| Store | Role |
| ----- | ---- |
| Session filesystem | Per-run files under `/session/<id>/`, including findings. See [Sessions](../concepts/sessions.md). |
| Checkpointer | LangGraph resume blob at `.waratah/sessions.db`. Not human-readable. |
| Transcript | Inspectable conversation at `.waratah/session/<id>/transcript.jsonl`. No tool arguments or payloads. |

## What to read next

- [Agents](../agent-config.md): `memory` defaults and empty-array disable
- [Sessions](../concepts/sessions.md): per-run files and HTTP identity
- [Instructions](../instructions.md): standing prompt vs loaded workspace files
