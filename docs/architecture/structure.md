# Proposed Project Structure

Phase 1 **uplifts this repository**. It already has `packages/agent` (YAML →
Claude/Cursor compiler) and `agents/content-marketer`. Those stay. The
LangGraph runtime is a second package, `packages/waratah`. Product LangGraph
agents are not authored under `agents/` until a later migration; Phase 1
proves the shape in `examples/daily-changes/`. See
`docs/architecture/solution.md` and `docs/architecture/MVP-PLAN.md`.

```ts
waratah/
├── package.json                    # pnpm workspace root
├── pnpm-workspace.yaml             # packages/* and examples/*
├── turbo.json
├── tsconfig.base.json
├── README.md
├── AGENTS.md
│
├── agents/                         # EXISTING — portable YAML defs (Claude/Cursor)
│   └── content-marketer/           #   stays on packages/agent until a later epic
│
├── packages/
│   ├── agent/                      # EXISTING — schema, loaders, Claude/Cursor providers
│   └── waratah/                    # NEW — LangGraph harness (the runtime this repo adds)
│       ├── bin/                    # `waratah` CLI entrypoint
│       ├── src/
│       │   ├── acp/                # Agent Client Protocol server (editor/local dev)
│       │   ├── protocol/           # waratah's own stable HTTP protocol (prod triggers)
│       │   │                       #   — POST /session, GET /session/:id/stream, etc.
│       │   ├── channel/            # channel runtime: normalizes a trigger → a session+message
│       │   ├── harness/            # compiles createAgent → CompiledStateGraph; invoke loop
│       │   ├── middleware/         # composable harness stack (filesystem, summarization,
│       │   │                       #   permissions, auto-memory, HITL, caching)
│       │   ├── subagents/          # GOVERNS how subagents run — the `task`/delegate tool,
│       │   │                       #   context isolation, findings write-back to session state.
│       │   │                       #   Owns no subagent *definitions* — those are authored,
│       │   │                       #   see "Authored Directory" below.
│       │   ├── approval/           # guardrail / human-gate layer, called by the harness
│       │   │                       #   before any write-capable tool call executes
│       │   ├── context/            # findings condensing; files ReducedValue channel (deepagents)
│       │   ├── memory/             # auto memory: resolve/load/compact MEMORY.md;
│       │   │                       #   later: structured cross-run store adapters
│       │   ├── sandbox/            # per-agent sandbox backends + provider adapters
│       │   ├── connections/        # MCP/OpenAPI external-service adapter runtime
│       │   ├── tools/              # built-in opinionated tools every agent gets for free
│       │   │                       #   (fs ls/read/write/edit/glob/grep, task, execute) —
│       │   │                       #   domain tools (github/slack/sentry/...) are authored,
│       │   │                       #   not shipped here — see below
│       │   ├── compiler/           # discovers agent/ dirs, compiles to .waratah/
│       │   ├── discover/           # authored-shape discovery + diagnostics
│       │   ├── cli/                # init / dev / build / info commands
│       │   ├── client/             # thin SDK for the HTTP protocol (stream consumer)
│       │   ├── evals/              # eval harness 
│       │   └── shared/             # types, zod schemas, utilities
│       ├── test/
│       ├── scripts/
│       ├── AGENTS.md
│       ├── ARCHITECTURE.md
│       ├── CHANGELOG.md
│       ├── README.md
│       └── package.json
│
├── examples/                       # a handful of worked authored agents, demonstrating
│   │                               #   the shape below — not a place product agents live
│   ├── daily-changes/              # Phase 1 fixture — PM lead + systems-analyst
│   ├── weather-agent/
│   ├── pr-reviewer/                #   a lead + a couple of nested subagents, for reference
│   └── ...
│
├── docs/
├── scripts/
├── skills/waratah/
└── ...
```

## Authored Directory

```ts
my-agent/
├── package.json
├── tsconfig.json
└── agent/
    ├── agent.ts              # entry point — see below
    ├── instructions.md         # system prompt
    ├── skills/<skill>/SKILL.md  # Agent Skills — metadata + on-demand procedures
    ├── tools/*.ts                 # typed tools this agent calls directly
    ├── channels/*.ts               # LEADS ONLY — trigger entry points (webhook, cron, Slack)
    ├── connections/*.ts             # external services this agent talks to directly
    ├── hooks/*.ts                    # lifecycle hooks (e.g. confidence-gate before a write)
    ├── sandbox/sandbox.ts             # override — only an action/execution subagent
    │                                  #   typically needs one
    └── subagents/                      # nested, authored here — not shared or versioned
        └── exploration/
            ├── agent.ts
            ├── instructions.md
            └── skills/<skill>/SKILL.md
```

A skill is a folder, not a lone markdown file. Waratah follows the
[Agent Skills](https://agentskills.io/home) open format: each directory
under `skills/` contains a required `SKILL.md` (YAML frontmatter with at
least `name` and `description`, plus the procedure body). Extra files are
optional and loaded only when the skill runs:

```
skills/<skill>/
├── SKILL.md          # required: metadata + instructions
├── scripts/          # optional: executable code
├── references/       # optional: documentation
├── assets/           # optional: templates, resources
└── ...               # any additional files or directories
```

The harness discovers skills by path under the folder listed in
`createAgent({ skills })` (default `./skills/` next to `agent.ts`). At
session start it loads only each skill's `name` and `description`; the
full `SKILL.md` and bundled files enter context when a task matches.

`createAgent` states identity that cannot be inferred: model, tools,
channels, subagents. Memory defaults to the project `.waratah/memory/`
directory. Omit `skills` and `memory` to keep the defaults. Pass one or
more paths to replace a default or to load additional locations.

```ts
import { createAgent } from "waratah";
import exploration from "./subagents/exploration/agent";

export default createAgent({
  model: "anthropic/claude-opus-4.8",
  skills: ["./skills/", "../shared/skills/"], // optional; omit for ./skills/ only
  memory: [".waratah/memory/", "./notes/MEMORY.md"], // optional; omit for .waratah/memory/ only
  tools: [...],
  subagents: [exploration],
});
```

Project `AGENTS.md` files (already on the repo: root and nested) are
loaded at session start. They are not part of the authored `agent/` tree
and are not listed on `createAgent`. See `FRAMEWORK-DESIGN.md` §4.

A subagent is just another `createAgent(...)` call — same shape, recursively
— referenced by import, not looked up by convention. Sharing a subagent
across more than one lead in the same product repo is ordinary code sharing
(export it from a local module and import it twice); waratah doesn't host or
version a subagent catalog on its own behalf.

## `.waratah/` (generated / inspectable)

Thin on purpose — no nested discovery/compile subtrees. Humans do not
hand-edit compile or journal files. `MEMORY.md` is agent-maintained
markdown (humans may read it; the agent will rewrite it).

```
.waratah/
├── manifest.json     # everything discovered + compiled for this agent, one file
├── sessions.db        # local durable session/turn/step store (dev/self-host)
├── traces.jsonl         # one line per traced event (session/turn/step/tool/LLM)
├── logs.jsonl
└── memory/
    └── MEMORY.md      # auto memory — per project, shared across worktrees
                       #   loaded every session, budget 200 lines or 25 KB
```

`memory/` is gitignored with the rest of `.waratah/`. Across git worktrees,
waratah uses the main worktree's `.waratah/memory/` so the scratchpad is
project-scoped, not worktree-scoped.
