---
title: "Skills"
description: "Package procedures under skills/ that waratah discovers and lists at session start."
---

A skill is a folder that follows the Agent Skills convention: a `SKILL.md` with `name` and `description` frontmatter, plus an optional body and sibling files. waratah discovers skill trees from the paths on `createAgent` (default `./skills/` beside `agent.ts`).

Skills are not typed execution. Tools stay visible whether a skill exists or not. If you need the model to call code, author a [tool](./tools/overview.md).

## Layout

A skill is a folder, not a lone markdown file at `skills/foo.md`:

```text
skills/<skill>/
├── SKILL.md          # required for a useful procedure
├── scripts/          # optional
├── references/       # optional
└── assets/           # optional
```

```md
---
name: digest-format
description: Format the daily Slack digest from condensed findings.
---

Write a short markdown digest. Lead with notable changes, then risks.
```

Write `description` as the task that should trigger the procedure, not as a label.

## How loading works today

Omit `skills` on `createAgent` to discover `./skills/`. That default directory may be missing. Pass `skills: []` to turn discovery off. Pass additional relative directories to include shared skill trees that still sit inside the authored agent root.

At compile time, discovered skill files are hashed into `.waratah/manifest.json`.

At session start, the harness loads those files from disk, then adds **one** system message listing their paths:

```text
Available skills:
- agent/skills/digest-format/SKILL.md
```

The skill body, frontmatter, and sibling files are not appended to the model context, and there is no `load_skill` tool. Progressive disclosure is not live. Until it is, put standing rules the model must follow in [instructions](./instructions.md).

## Scope

Skills are scoped to the agent that declares them. A [subagent](./subagents/index.md)'s `skills/` are discovered for that child only. The lead does not inherit a child's skills, and the reverse holds too.

To share a procedure across agents, keep the files in one directory both definitions can list, as long as that directory stays inside the authored root. waratah does not host a skill registry.

## What to read next

- [Instructions](./instructions.md): always-on system prompt, the counterpart to skills
- [Tools](./tools/overview.md): typed actions the model can call
- [Agents](./agent-config.md): `skills` path defaults and empty-array disable
