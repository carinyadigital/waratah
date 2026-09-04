# Architecture

> **Ownership rule**: When the authoring model, runtime split, protocol,
> session identity, or deployment topology change, this document must be
> updated in the same PR.

waratah is a filesystem-first TypeScript harness for durable AI agents. An
agent is a directory on disk — instructions, skills, tools, connections,
channels, hooks, sandbox, and nested subagents are files — and waratah
compiles that directory to a LangGraph `CompiledStateGraph` and runs it.
Authors call `createAgent`; they never import `@langchain/langgraph`.

This repository also ships `packages/agent`, a YAML compiler that renders
`agents/` to Claude and Cursor. The two authoring paths do not mix in one
directory.

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Trigger / operator                           │
│   cron · GitHub webhook · Slack event · Sentry webhook · HTTP    │
│   ACP (editor / local dev) · manual "run now"                    │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │     Channel       │  normalizes trigger →
                    │  (lead only)      │  session + message;
                    │                   │  owns delivery idempotency
                    └─────────┬─────────┘
                              │ graph.invoke({ thread_id })
                    ┌─────────▼─────────┐
                    │  waratah harness  │  CompiledStateGraph
                    │  (lead graph)     │  model / tool loop
                    │                   │  files ReducedValue channel
                    └──┬────────────┬───┘
                       │            │
              ┌────────▼──┐  ┌──────▼──────────┐
              │  Built-in │  │  task tool      │
              │  fs tools │  │  (subgraph)     │
              └────────┬──┘  └──────┬──────────┘
                       │            │
                       │     ┌──────▼──────────┐
                       │     │  Subagent graph │  isolated messages
                       │     │  (no channels)  │  shared files channel
                       │     └──────┬──────────┘
                       │            │ write
                       └────────────▼──────────┐
                              ┌────────────────▼────────────────┐
                              │  Session filesystem             │
                              │  /session/<id>/findings/*.md    │
                              │  checkpointer (thread = session)│
                              └────────────────┬────────────────┘
                                               │
                    ┌──────────────────────────┼──────────────────┐
                    ▼                          ▼                  ▼
             ┌────────────┐            ┌─────────────┐    ┌─────────────┐
             │  Authored  │            │  Approval   │    │  Inspectable│
             │  domain    │            │  interrupt  │    │  artifacts  │
             │  tools     │            │  (HITL)     │    │  + traces   │
             └────────────┘            └─────────────┘    └─────────────┘
```

A channel is not a graph. It accepts a trigger, derives `thread_id` from
the delivery id, and invokes the compiled lead. The lead may call `task`,
which runs a subagent as an isolated subgraph against the same `files`
channel. The subagent's job ends when it writes condensed findings; the
lead never sees the raw payload. Write-capable tools pass through the
approval layer. Crash or redeploy resumes from the checkpointer.

Product automations live in product repos and depend on the `waratah`
package root. Credentials, channel IDs, and schedules are deployment
config, not framework code.

**Source files**: `packages/waratah/src/shared/contracts.ts`,
`packages/waratah/src/shared/errors.ts`, `packages/waratah/package.json`

---

## 2. Deployment Topology

| Service | Platform | Role |
|---------|----------|------|
| Production HTTP | In-process server, or LangGraph Platform when a lead needs multi-host resume | `POST /session` and the rest of the trigger protocol |
| Local CLI | `waratah serve` / `waratah` CLI | Author, compile, invoke, ACP |
| Checkpointer (prod) | `PostgresSaver` | Crash-resume across hosts |
| Checkpointer (local) | `SqliteSaver` | Single-host durability |
| Checkpointer (CI) | `MemorySaver` | In-process tests, fake `ModelAdapter` |
| YAML compile + publish | GitHub Actions `deploy.yml` | `packages/agent` → Claude (Cursor renders; no publisher) |
| Documentation | `apps/docs` over `docs/` | Published framework docs |

`thread_id` is a function of the trigger `deliveryId`. A seen delivery
whose thread is `running` or `succeeded` returns duplicate and does not
invoke again.

**Source files**: `packages/waratah/src/session/`,
`packages/waratah/src/protocol/`, `.github/workflows/deploy.yml`

---

## 3. Authoring Model

Markdown is the default. TypeScript is used where behaviour needs types or
execution. `agent.ts` is the exception: identity (model, tools, channels,
subagents, and any skill or memory path overrides) is stated explicitly
rather than inferred from whatever files happen to sit in a directory.

```
agent/
├── agent.ts                 # createAgent({ model, tools, subagents, … })
├── instructions.md          # system prompt
├── skills/<skill>/SKILL.md  # Agent Skills (agentskills.io)
├── tools/*.ts               # typed tools this agent calls directly
├── channels/*.ts            # LEADS ONLY — trigger entry points
├── connections/*.ts         # MCP / OpenAPI clients this agent talks to
├── hooks/*.ts               # lifecycle hooks (e.g. confidence-gate)
├── sandbox/sandbox.ts       # override — write-capable workers only
└── subagents/<name>/        # nested, same shape, recursively
    ├── agent.ts
    ├── instructions.md
    └── skills/<skill>/SKILL.md
```

A skill is a folder, not a lone markdown file:

```
skills/<skill>/
├── SKILL.md          # required: name + description frontmatter, plus body
├── scripts/          # optional: executable code
├── references/       # optional: documentation
├── assets/           # optional: templates, resources
└── …
```

Discovery loads each skill's `name` and `description` only. The body and
bundled files enter context when the skill activates. Omit `skills` on
`createAgent` to use `./skills/` beside `agent.ts`. Omit `memory` to use
the project memory directory. An empty array turns that source off.
Project `AGENTS.md` is never listed on `createAgent`: it already lives on
the repo and is loaded at session start.

A **lead** authors `channels/`. A **subagent** is the same
`createAgent(...)` shape, nested or imported, and must not author
`channels/` — compile fails with `INVALID_CHANNEL_SCOPE`. Sharing a
subagent across leads in a product repo is ordinary module sharing;
waratah does not host a worker catalog.

Connection names, tool names, and similar identifiers come from the
filesystem path (`agent/connections/linear.ts` → `"linear"`). Definition
helpers are named for the protocol they target
(`defineMcpClientConnection`, not `defineConnection`).

A directory is either a YAML portable def (`agent.yaml`, compiled by
`packages/agent`) or a waratah agent (`agent.ts`, compiled by
`packages/waratah`). Never both.

**Source files**: `packages/waratah/src/agent/`,
`packages/waratah/src/discover/`

---

## 4. Runtime Architecture

Channel, harness, and workflow stay separate.

| Layer | waratah | LangGraph primitive |
|-------|---------|---------------------|
| **Channel** | Normalizes a trigger into a session + message. Owns trigger-side dedup. Not a graph. | Channel code calls `graph.invoke(input, { configurable: { thread_id } })`. |
| **Harness** | The compiled lead graph: interpret the message, call `task`, read findings, stop or escalate. Identical for cron or webhook. | `CompiledStateGraph` from `createAgent` — model/tool loop plus the `files` state channel. |
| **Workflow** | Session is a durable thread; turn is one `invoke`; model or tool call is a checkpointed step. A human-gate is `interrupt()`. | `BaseCheckpointSaver`. `thread_id` = session id. |

### Subagents

A `task` call invokes the declared subagent graph with a fresh `messages`
list and the parent `files` channel. Findings enforcement wraps that
invoke: the subgraph must write `/session/<id>/findings/<name>.md` before
`task` returns success (`SUBAGENT_FINDING_MISSING` otherwise). A model can
call only tools bound to the current agent.

### Built-in tools

Every agent gets filesystem tools against the session `files` channel
(`ls`, `read`, `write`, `edit`, `glob`, `grep`), `task` for delegation,
and `execute` (only against a sandbox backend). There is no default
planning/todo tool; a lead's plan is its subagent sequence.

### Limits

| Limit | Value |
|-------|------:|
| max steps per turn | 20 |
| max tool calls per step | 4 |
| max tool result bytes | 256 KiB |
| max finding bytes | 32 KiB |

**Source files**: `packages/waratah/src/harness/`,
`packages/waratah/src/subagents/`, `packages/waratah/src/tools/`,
`packages/waratah/src/shared/errors.ts`

---

## 5. Compilation and Discovery

```
authored agent/ tree
        │
        ▼
  discover/     walk agent.ts, instructions, skills, tools, channels,
                connections, hooks, sandbox, nested subagents
        │
        ▼
  compiler/     reject channels on subagents; bind tools per agent;
                emit CompiledStateGraph + manifest.json
        │
        ▼
  harness/      invoke loop, limits, files channel, approval seam
```

`waratah build` imports `agent/agent.ts`, walks declared subagents, and
writes `manifest.json`. Compile fails with all diagnostics in one run and
leaves the previous manifest untouched. The manifest is inspectable
compile output, not an authoring API.

All runtime behaviour lives in the `waratah` package. Authored agents
depend only on the package root — never `@langchain/langgraph` and never
`packages/waratah/src/**`. Third-party APIs are wrapped behind
waratah-owned surfaces.

**Source files**: `packages/waratah/src/compiler/`,
`packages/waratah/src/discover/`, `packages/waratah/src/shared/contracts.ts`

---

## 6. Session, State, and Memory

| Term | Meaning |
|------|---------|
| Lead | Authored agent with `channels/`. Compiles to the root graph. |
| Subagent | Authored agent without `channels/`. Compiles to a subgraph. Invoked only via `task`. |
| Session | One LangGraph `thread_id`. Equals the accepted delivery's session id. |
| Turn | One `graph.invoke` for that thread. |
| Step | One checkpointed model, tool, or subagent node. |
| Findings | Condensed markdown at `/session/<id>/findings/<subagent>.md`. |
| Manifest | Inspectable compile output (`manifest.json`). |
| Delivery | Trigger identity. `thread_id` is a function of `deliveryId`. |

A new session identity is never minted for a seen delivery.

### Project conventions — `AGENTS.md`

Git-tracked markdown already on the workspace. Ownership, layout, review
rules, "never do X." Agents read it; they do not append learnings to it.

At the start of every session — lead or subagent — the harness injects:

1. The target repo root `AGENTS.md`, if it exists.
2. Nested `AGENTS.md` files along paths the session is working in.
3. Any further workspace roots the session is explicitly attached to.

Missing files are skipped. Nested files add or override for their subtree.

### Auto memory — `MEMORY.md`

Agent-written scratchpad for corrections, preferences, and recurring
patterns. Loaded every session, capped at **200 lines or 25 KB**. Across
git worktrees, waratah resolves the main worktree's memory directory so
the scratchpad is project-scoped, not worktree-scoped. Agents update the
file; they do not append forever. Over-budget files are compacted, not
grown.

### Per-run session filesystem

The shared memory vault is the filesystem: a `files` `ReducedValue`
channel on graph state, so parallel subagents can write different paths
without clobbering. A worker's job ends with a write to
`/session/<id>/findings/<name>.md`. Raw diffs never return to the lead.
Path confinement keeps tools inside the session root
(`INVALID_SESSION_PATH`).

### Cross-run structured store

Postgres holds durable facts across runs per project — known false
positives, last-summarised commit, resolved-question cache. This is not
`MEMORY.md` and not `AGENTS.md`.

**Source files**: `packages/waratah/src/session/`,
`packages/waratah/src/memory/`, `packages/waratah/src/context/`,
`packages/waratah/src/shared/ids.ts`

---

## 7. Protocols and Identity

waratah speaks two protocols.

| Protocol | Audience | Durability |
|----------|----------|------------|
| **ACP** (`src/acp`) | Editor-attached local dev and debugging | Ephemeral, interactive |
| **HTTP** (`src/protocol`) | Production triggers | Durable, webhook-addressed |

Production HTTP:

| Method | Path | Role |
|--------|------|------|
| `POST` | `/session` | Open or dedup a session from `deliveryId` |
| `GET` | `/session/:id/stream` | NDJSON, replayable, resumable from an index |
| `POST` | `/session/:id` | Follow-up turn on an existing session |
| `POST` | `/session/:id/cancel` | Cancel in-flight work |
| `POST` | `/session/:id/compact` | Compact context |

Session IDs are immutable. A reset retires the ID; it is never silently
reassigned. Webhook retries land on the same session.

`CreateSessionCommand.trigger` is `'manual' | 'cron' | 'http'`. Channel
code maps a concrete trigger (GitHub, Slack, Sentry, cron tick) onto that.

**Source files**: `packages/waratah/src/protocol/`,
`packages/waratah/src/acp/`, `packages/waratah/src/client/`

---

## 8. Tools, Connections, and Sandbox

### Domain tools

`github`, `slack`, `sentry`, `databricks`, `confluence`, and other domain
tools are authored in `agent/tools/*.ts` in the product repo. If a product
team wants one shared across their leads, they version it as their own
package. waratah does not host a tool registry.

### Connections

`agent/connections/*.ts` are MCP or OpenAPI adapters. The runtime lives in
`packages/waratah/src/connections`. Names come from file paths. Secrets
stay in adapter closures; they never enter prompts, session files,
manifests, traces, or tool output.

### Sandbox

A worker with write blast radius — pull a branch, generate a diff, open an
MR — declares `agent/sandbox/sandbox.ts`. That provisions an isolated
ephemeral environment per run and tears it down after. Every other agent
runs against the in-process state backend. `execute` is a no-op without a
sandbox.

**Source files**: `packages/waratah/src/tools/`,
`packages/waratah/src/connections/`, `packages/waratah/src/sandbox/`

---

## 9. Security Model

### Trust boundaries

```
Trigger (webhook / cron / operator)
    ↔ Channel (idempotency, no graph)
        ↔ Harness (model sees instructions, AGENTS.md, MEMORY.md, skill metadata, findings)
            ↔ Tool executor (approval seam, path confinement, bound work)
                ↔ Authored adapter (secrets in closure, scoped service identity)
                    ↔ Upstream (GitHub, Slack, Sentry, …)
Subagent subgraph
    ↔ shared files channel only; no channels; no lead-owned side effects
```

The model is never trusted to enforce policy. Guardrails sit at the tool
boundary.

### Approval

`packages/waratah/src/approval` sits between the harness and any
write-capable tool:

- Evaluated by the **lead**, never by a worker. A worker can propose a
  patch; only the lead decides whether it reaches GitHub or Slack.
- First-match-wins permission rules. A sensitive-file allowlist/denylist
  forces a human path regardless of confidence.
- A human-gate is LangGraph `interrupt()` — parked work, zero compute
  until a human acts.
- No agent merges its own MR. Least-privilege service identities.
- Slack destination is not model-controlled.
- Write-capable tools run at most once per turn; a failed journal after
  the side effect accepted is not auto-replayed.

### Untrusted input

Authorize every access on the server, keyed to the resource. Never render
untrusted input as HTML. Client-facing errors stay generic; secrets, stack
traces, and other users' data do not leave server logs. Bound
request-driven work (steps, bytes, depth). Validate outbound URLs before
fetch (SSRF).

**Source files**: `packages/waratah/src/approval/`,
`packages/waratah/src/shared/errors.ts`

---

## 10. Observability

Compile and run write a small inspectable working directory (gitignored):
`manifest.json`, `sessions.db` (local), `traces.jsonl`, `logs.jsonl`, and
`memory/MEMORY.md`. Diagnosis is a grep of those files, not a read of
framework source.

Trace events: start / complete / error per **session**, **turn**,
**model**, **tool**, and **subagent**. JSONL allowlist sink: no
credentials, prompts, raw diffs, or Slack bodies.

Eval and production share that event schema:

- False positives / negatives
- MR acceptance (merged as-is / after edits / wrong target / duplicated)
- Terminal outcome vs silent or interrupted end
- Billed tokens per useful output
- Tool-call volume, failure count, latency
- Agent stack traces (which workers actually ran)
- LLM latency and error rate per model

**Source files**: `packages/waratah/src/observability/`,
`packages/waratah/src/evals/`

---

## 11. Testing

Pick the tightest tier that can express the assertion.

| Tier | Where | What |
|------|-------|------|
| **Unit** | `packages/waratah/src/**/*.test.ts` | Pure logic, colocated. No filesystem writes, subprocesses, or network. |
| **Integration** | `src/**/*.integration.test.ts` | Multiple modules in memory. Fake `ModelAdapter` and fake domain adapters. |
| **Scenario** | `src/**/*.scenario.test.ts`, `test/scenarios/` | Real subprocess, HTTP port, or bundler. |
| **E2E** | `e2e/fixtures/*/evals/` | Fixture-owned `waratah eval` suites, CI only. |

CI never calls a live model, GitHub, or Slack. YAML gates stay in the same
pipeline: `pnpm validate` and `pnpm build:check` for
`agents/content-marketer`.

**Source files**: `packages/waratah/test/`, `packages/agent/tests/`, `e2e/`

---

## 12. CI/CD

| Workflow | Trigger | Checks |
|----------|---------|--------|
| `ci.yml` | PR, push to `main` | `pnpm validate` → `pnpm build:check` → `pnpm typecheck` → `pnpm test` |
| `deploy.yml` | Manual | `build:check`, then `pnpm run deploy` to Claude (`--dry-run` by default) |

Commits are DCO-signed (`git commit -s`). PRs that touch the published
`waratah` package include a changeset. Pre-1.0, use `patch` unless a
public API breaks (`minor`).

**Source files**: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`,
`CONTRIBUTING.md`

---

## 13. Directory Reference

```
.
├── ARCHITECTURE.md                 this file
├── AGENTS.md                       conventions for this repo
├── package.json                    pnpm workspace root
├── pnpm-workspace.yaml             packages/* and examples/*
│
├── agents/                         portable YAML defs (Claude/Cursor)
│   └── content-marketer/
│
├── packages/
│   ├── agent/                      schema, loaders, Claude/Cursor providers
│   └── waratah/                    LangGraph harness
│       ├── src/
│       │   ├── agent/              createAgent
│       │   ├── discover/           authored-shape discovery + diagnostics
│       │   ├── compiler/           graph + manifest
│       │   ├── harness/            StateGraph compile, invoke, limits
│       │   ├── middleware/         filesystem, summarization, permissions,
│       │   │                       auto-memory, HITL, caching
│       │   ├── context/            files ReducedValue channel; findings
│       │   ├── subagents/          task tool, subgraph run, findings write-back
│       │   ├── tools/              built-in fs, task, execute
│       │   ├── channel/            trigger → session + message
│       │   ├── protocol/           production HTTP
│       │   ├── acp/                Agent Client Protocol (editor / local)
│       │   ├── client/             thin SDK for the HTTP protocol
│       │   ├── session/            thread_id from deliveryId; checkpointer
│       │   ├── memory/             AGENTS.md + MEMORY.md load / write / compact
│       │   ├── approval/           guardrail / human-gate before write tools
│       │   ├── sandbox/            per-agent sandbox backends
│       │   ├── connections/        MCP / OpenAPI adapter runtime
│       │   ├── evals/              eval harness
│       │   ├── observability/      JSONL traces / logs
│       │   └── shared/             contracts, errors, ids
│       ├── bin/                    waratah CLI
│       └── test/
│
├── examples/                       worked authored agents, not product homes
├── docs/                           published user docs
├── apps/docs/                      docs site
├── e2e/                            fixture-owned waratah eval suites
├── research/                       public-API research docs
└── skills/waratah/                 editor skill pointing at packaged docs
```

**Source files**: `pnpm-workspace.yaml`, `packages/waratah/package.json`
