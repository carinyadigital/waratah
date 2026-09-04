---
type: Solution
version: '0.1'
owner: JD
status: Draft
last_updated: 2026-09-01
related:
  - docs/structure.md
  - docs/architecture/decisions/register.md
---

# Solution -- waratah (LangGraph harness)

waratah is the TypeScript harness that compiles an authored lead/worker
agent to a LangGraph `CompiledStateGraph`. This document is the
architecture authority for implementation. Module-level design lives in
[`FRAMEWORK-DESIGN.md`](FRAMEWORK-DESIGN.md); the six-lead product catalog
lives in [`LANGGRAPH-ARCHITECTURE.md`](LANGGRAPH-ARCHITECTURE.md); the
Phase 1 slice lives in [`MVP-PLAN.md`](MVP-PLAN.md). Do not re-narrate
those here.

## 1. Context and scope

### 1.1 System context

This repository already ships a portable YAML compiler (`packages/agent`)
that renders `agents/` to Claude and Cursor. Phase 1 **uplifts** the same
repo: it adds a LangGraph runtime beside that compiler. It does not
replace Claude/Cursor deploy in this epic.

```text
[Scheduler / webhook / operator]
  |
  +-- [waratah channel]  (cron | POST /session)
        |
        +-- [waratah harness]  createAgent → CompiledStateGraph
              |                      |
              |                      +-- [@langchain/langgraph]
              |                            checkpointer (thread = session)
              |
              +-- [lead graph]
                    |
                    +-- [subagent subgraph]  via task tool
                          |
                          +-- [files channel]  /session/<id>/findings/*.md
                                |
                                +-- [authored domain tools]
                                      git-reader, slack-post, …

[Existing, unchanged in Phase 1]
  agents/content-marketer  --packages/agent-->  Claude / Cursor dist/
```

### 1.2 System boundary

**waratah owns:**

- `createAgent` / `defineTool` authoring API and authored-directory
  discovery (`agent.ts`, `instructions.md`, `skills/`, nested `subagents/`).
- Compilation to a LangGraph graph plus `.waratah/manifest.json`.
- Built-in filesystem tools, the `task` tool, findings write-back.
- Channel normalization, `POST /session`, local `SqliteSaver` durability.
- Session bootstrap: project `AGENTS.md` and optional `MEMORY.md` load.

**waratah does not own:**

- Product leads, domain tools, or worker *content* (those live in product
  repos or, in this repo, `examples/`).
- Claude/Cursor payload shape (`packages/agent` keeps that).
- LangGraph Platform hosting, Temporal, or a second workflow engine.
- The `deepagents` npm package (design source only).
- GitHub/Slack credentials, schedules, and channel IDs (deployment config).

### 1.3 Upstream and downstream systems

- **Upstream — LangGraph JS (`@langchain/langgraph`).** Graph compile,
  checkpointer, subgraphs, `interrupt()`. Pin a documented minor; do not
  wrap types the public authoring API does not need.
- **Upstream — LangChain chat models (`@langchain/core`).** `ModelAdapter`
  is the seam; Phase 1 tests use a fake model.
- **Downstream — authored agents.** Depend only on the `waratah` package
  root. They must not import `@langchain/langgraph` or `packages/waratah/src/**`.
- **Downstream — Slack / git host.** Called only from authored adapters,
  never from the harness.

## 2. Quality goals and constraints

### 2.1 Quality goals (top 3–5)

1. **Isolation and scope.** A subagent cannot own a channel; a model can
   call only tools bound to its current agent; findings are the only
   payload the lead consumes from a worker.
2. **Idempotent triggers.** The same `deliveryId` never starts a second
   side-effecting run.
3. **Inspectability.** `.waratah/manifest.json`, checkpointer thread, and
   JSONL traces explain a run without reading framework source.
4. **Coexistence.** Existing `pnpm validate` / `pnpm build:check` for
   `agents/content-marketer` stay green while waratah is added.
5. **At-most-once publication.** `slack-post` runs at most once per Phase 1
   turn; a failed journal after Slack accepted is not auto-replayed.

### 2.2 Constraints

- **Technical:** Node `>=24`, `pnpm@11.18.0`, TypeScript strict. LangGraph
  is the runtime. Phase 1 checkpointer is `MemorySaver` in tests and
  `SqliteSaver` (`@langchain/langgraph-checkpoint-sqlite`) locally.
- **Regulatory:** Secrets never enter prompts, session files, manifests,
  traces, or tool output. Least-privilege service identities for git and
  Slack.
- **Organisational:** Conventional Commits; PR review; CI on PRs and
  `main`. No non-dry-run deploy or GitHub Environment secret change
  without asking.

## 3. Solution strategy

1. **LangGraph is the runtime, not an option.** Authors call `createAgent`;
   the compiler emits `CompiledStateGraph`. We do not hand-roll a
   model/tool while-loop, Temporal, or a Vercel Workflow SDK world.
   *Trade-off:* we inherit LangGraph's thread/checkpoint model and cannot
   silently invent a second session identity. *Quality:* #2, #3.
2. **deepagents opinions, not the package.** Filesystem tools, `files`
   `ReducedValue` channel, isolated `task` subgraphs. We reimplement that
   subset so `/session/<id>/findings/<name>.md` and "subagents have no
   channels" stay first-class. *Trade-off:* we own bugs the upstream
   package already fixed. *Quality:* #1.
3. **eve authoring and channel split.** Markdown for instructions and
   skills; TypeScript for tools, channels, and `agent.ts`. Channel code
   normalizes a trigger then `invoke`s the graph. *Quality:* #3.
4. **Uplift, do not greenfield.** `packages/agent` and `agents/` remain.
   `packages/waratah` and `examples/daily-changes` are added. CI gains
   waratah gates without dropping YAML gates. *Quality:* #4.
5. **Guardrails at the tool boundary.** Approval is a seam (always-allow in
   Phase 1). Side-effect budget for `slack-post` is executor-enforced.
   *Quality:* #1, #5.

| Principle | Quality goal |
| --------- | ------------ |
| LangGraph runtime | Idempotent triggers, inspectability |
| deepagents subset | Isolation and scope |
| eve channel split | Inspectability |
| Repo uplift | Coexistence |
| Tool-boundary guardrails | Isolation, at-most-once publication |

## 4. Building block view

Target layout: [`docs/structure.md`](../structure.md). Phase 1 files:
[`specs/waratah-01/tdd.md`](../../specs/waratah-01/tdd.md) §3.

```text
packages/waratah/src/
  agent/        createAgent
  discover/     load authored tree
  compiler/     graph + manifest
  harness/      StateGraph compile, invoke, limits
  context/      files channel, path confinement
  subagents/    task tool, subgraph run, findings
  tools/        fs builtins, executor, approval seam
  memory/       AGENTS.md + MEMORY.md load
  channel/      cron → invoke
  protocol/     POST /session
  session/      thread_id from deliveryId; SqliteSaver wiring
  observability JSONL traces/logs
  shared/       contracts, errors, ids

packages/agent/                 KEEP — YAML compiler
agents/content-marketer/        KEEP — Claude/Cursor coordinator
examples/daily-changes/         NEW — LangGraph fixture lead
```

## 5. Runtime view

Sequences in [`FRAMEWORK-DESIGN.md`](FRAMEWORK-DESIGN.md) §3 and
[`specs/waratah-01/tdd.md`](../../specs/waratah-01/tdd.md) §5. Summary:

1. **Compile.** `waratah build` imports `agent/agent.ts`, walks declared
   subagents, rejects channels on subagents, writes `.waratah/manifest.json`,
   and returns a `CompiledStateGraph` with a `files` channel.
2. **Accept.** Cron or `POST /session` supplies `deliveryId`. `thread_id`
   is derived from it. If that thread is already running or succeeded, return
   duplicate; do not invoke.
3. **Lead invoke.** System content = instructions + project `AGENTS.md` +
   capped `MEMORY.md` + skill metadata. Tools = fs + `task` + `slack-post`.
4. **Delegate.** `task` invokes the systems-analyst subgraph with a fresh
   message list and the shared `files` channel. Success requires a non-empty
   findings file. Raw diffs never return to the lead.
5. **Publish.** Lead reads findings, formats, calls `slack-post` once.
   Executor rejects a second call in the same turn.

## 6. Data model and ubiquitous language

| Term | Meaning |
| ---- | ------- |
| Lead | Authored agent with `channels/`. Compiles to the root graph. |
| Subagent | Authored agent without `channels/`. Compiles to a subgraph. Invoked only via `task`. |
| Session | One LangGraph `thread_id`. Equals the accepted delivery's session id. |
| Turn | One `graph.invoke` for that thread. |
| Step | One checkpointed model, tool, or subagent node. |
| Findings | Condensed markdown at `/session/<id>/findings/<subagent>.md`. |
| Manifest | Inspectable compile output in `.waratah/manifest.json`. Not an authoring API. |
| Auto memory | `.waratah/memory/MEMORY.md`. Loaded, not written, in Phase 1. |
| Portable def | Existing `agent.yaml` tree under `agents/`. Claude/Cursor only until a later epic. |

Contracts: [`specs/waratah-01/tdd.md`](../../specs/waratah-01/tdd.md) §4.

Invariant: `thread_id` is a function of `deliveryId`. A new session identity
is never minted for a seen delivery.

## 7. Cross-cutting concepts

- **Observability.** Start/complete/error per session, turn, model, tool,
  and subagent (`LANGGRAPH-ARCHITECTURE.md` §8). JSONL allowlist sink;
  no credentials, prompts, raw diffs, or Slack bodies.
- **Errors.** Typed `WaratahErrorCode` (`tdd.md` §4.7). Compile fails with
  all diagnostics in one run and leaves the previous manifest untouched.
- **Security.** Path confinement to the session root; tool scope per agent;
  secrets only in adapter closures; Slack destination not model-controlled.
- **Testing.** Fake `ModelAdapter` and fake domain adapters. No live model,
  GitHub, or Slack in CI. See `tdd.md` §9.
- **Feature flags.** None in Phase 1. Approval policy is a no-op allow.

## 8. Deployment and environments

| Environment | Graph host | Checkpointer | Agents |
| ----------- | ---------- | ------------ | ------ |
| CI / unit | in-process | `MemorySaver` | `examples/daily-changes` fakes |
| Local dev | `waratah serve` | `SqliteSaver` → `.waratah/sessions.db` | fixture or real adapters |
| Production Phase 1 | in-process HTTP | `SqliteSaver` (single host) | product PM lead |

LangGraph Platform and `PostgresSaver` are post-Phase 1. Existing Claude
deploy (`pnpm run deploy -- --provider claude`) is unchanged.

CI on PRs and `main`: current `validate` → `build:check` → `typecheck` →
`test`, plus waratah package test/typecheck once that package exists
(`tdd.md` §9.5).

## 9. Architectural decisions (ADR log)

`docs/architecture/decisions/` is empty. Candidates to harvest after
Phase 1 ships (`/architecture:adr plan WARATAH-01`):

| Candidate | Status |
| --------- | ------ |
| LangGraph is the runtime; waratah is the harness | In this document §3.1 — _(Not yet written)_ as ADR |
| No runtime dependency on `deepagents` | In this document §3.2 — _(Not yet written)_ |
| `packages/agent` coexistence until YAML migration | In this document §3.4 — _(Not yet written)_ |
| Subagents are subgraphs with shared `files` channel | [`FRAMEWORK-DESIGN.md`](FRAMEWORK-DESIGN.md) §3 — _(Not yet written)_ |
| SqliteSaver locally, PostgresSaver later | [`FRAMEWORK-DESIGN.md`](FRAMEWORK-DESIGN.md) §9 — _(Not yet written)_ |
| Subagents must not declare channels | [`FRAMEWORK-DESIGN.md`](FRAMEWORK-DESIGN.md) §2 — _(Not yet written)_ |

## 10. Risks, technical debt, and open questions

### 10.1 Risks

| ID | Risk | Likelihood | Impact | Mitigation |
| -- | ---- | ---------- | ------ | ---------- |
| R1 | LangGraph minor breaks compile API | Medium | Medium | Pin documented JS packages; adapter tests on `compile` + `invoke` |
| R2 | Dual authoring (YAML vs `createAgent`) confuses contributors | High | Medium | `AGENTS.md` states both paths; do not mix in one agent directory |
| R3 | Slack accepted but process dies before checkpoint | Low | High | No auto-replay of in-flight failed sessions (`tdd.md` §5.6) |
| R4 | Reimplementing deepagents filesystem diverges from upstream | Medium | Low | Keep the files-channel reducer small; cite deepagentsjs |

### 10.2 Technical debt

- **Two packages, two CLIs.** `agent` and `waratah` until YAML agents
  migrate. Close when `content-marketer` runs on LangGraph.
- **Single-host SqliteSaver.** Enough for the daily digest; not enough for
  multi-host write-capable leads.
- **Approval always-allow.** Must become `interrupt()` before any MR-writing
  lead.

### 10.3 Open questions

Product-integration questions (repo, git host, Slack, schedule, model,
quality threshold) are in [`specs/waratah-01/tdd.md`](../../specs/waratah-01/tdd.md) §12.
They block S6 go-live, not framework implementation against the fixture.

## 11. Graduation candidates

| Pattern | Current home | Graduate to | Trigger |
| ------- | ------------ | ----------- | ------- |
| Authored `createAgent` directory | `examples/daily-changes` | product-repo convention | Second LangGraph lead in a product repo |
| Findings path + `task` subgraph | `packages/waratah/src/subagents` | keep in waratah | — already the shared mechanism |
| YAML `agent.yaml` compiler | `packages/agent` | retire or compile-to-waratah | `content-marketer` migration epic |
