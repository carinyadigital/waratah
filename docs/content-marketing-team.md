# `content-marketer` — team design for review

**Status:** phase 1 built — `content-marketer` (lead), `content-analyst` and
`market-researcher`, Loop A (discovery) only. See §6 and §8 for what shipped
and what's still open.
**Date:** 02/08/2026, updated 03/08/2026.
**Supersedes:** the pipeline design of the same name.

One deployable team. `content-marketer` is the lead and the only agent with schedules.
Its subagents hold no clock — they are spawned at runtime, in their own isolated threads,
when the lead needs something it does not have.

The lead runs a desk. It decides what is worth doing and whether the result is good
enough. It does not write. The subagents do real work, including writing — what makes
them subagents is that none of them chooses the work or ships it.

---

## 1. Shape

```
agents/content-marketer/
  agent.yaml            lead identity, model tier, roster, permissions
  instructions.md       how the desk is run
  connectors/           backlog only
  schedules/            the two loops
  subagents/
    content-analyst/    performance
    audience-researcher/
    market-researcher/
    content-planner/    opportunities, then briefs
    post-writer/
    reviewer/
    asset-manager/
  dist/
```

One version, one release, one deploy. Subagents are not separately deployable products —
they are staff, and staff do not have their own release trains.

---

## 2. The two loops

The lead carries two deployments on different clocks. They share nothing at runtime and
never run in the same session.

### Loop A — discovery and planning

```
              ┌─ content-analyst      performance, against pre-registered questions
lead fans out ├─ audience-researcher  themes from support, comments, replies, site search, SERP intent
              └─ market-researcher    competitors, category movement, regulation
                        │
                  all three report
                        │
              lead reads and synthesises
                        │
              content-planner ──────► candidate opportunities
                        │
              lead selects the top N
                        │
              content-planner ──────► a brief per selected opportunity
                        │
              lead writes them to the backlog
```

The three researchers are genuinely independent and start together — the textbook
parallelisation case. `content-planner` is dispatched twice, for two different jobs.

**Why the planner exists at all, given the lead could do this.** Not capability, context.
Identifying opportunities means reading three research reports in full; writing briefs
means reading competitor pages and past performance. That volume does not belong in the
context that has to stay clear enough to say no. Same argument the cookbook makes for
keeping the case-study library out of the coordinator.

### Loop B — production

```
lead selects the highest-priority ready brief
          │
    post-writer ──────► draft
          │
    reviewer ─────────► findings (brand, editorial, factual)
          │
    asset-manager ────► an approved image from inventory
          │
    lead reviews draft, headline, tags
          │
    ├── revise ──► back to post-writer (max 2 rounds)
    └── ready ───► backlog status changes, JD approves
```

Threads persist, so sending a draft back to `post-writer` reaches the same worker with its
own draft still in context. The revise loop is native, not something we build.

**The loop is bounded at two rounds.** After that it ships to JD's review or returns to the
backlog with a note. The lead is judging its own team's output; without a cap it will fund
a very thorough argument between two agents.

---

## 3. The backlog is the interface

Briefs persist outside both loops. This is the load-bearing decision in the design.

Discovery can fail on a Monday and production still runs on Thursday against briefs
already banked. You can reorder the queue, kill a brief, or add one by hand, and neither
loop needs to know. This is where "multi-agent reduces the need for workflow" actually
cashes out — not because delegation replaced orchestration, but because durable shared
state did.

**Recommendation: Linear.** Status transitions and priority are first-class, it has an MCP
server, and a brief is close enough to an issue that we are not bending the tool. It needs
authorising before anything can use it. Sheets is the honest fallback if you want to
eyeball and reorder fast.

### The brief schema is the contract

Both loops depend on it and production cannot read what discovery did not write
consistently. Minimum fields:

| Field | Why |
|---|---|
| `slug`, `title`, `type` (post / recipe) | identity and routing |
| `cluster` | the analyst reports at cluster level, never per page |
| `claim` | what this piece asserts |
| `baseline` | the current number it is trying to move |
| `horizon` | when we check |
| `confidence` | stated up front, not after |
| `falsifier` | what result would tell us this was wrong |
| `evidence` | which research report produced it |
| `status` | proposed / ready / drafting / in-review / approved |

The last five come straight from `content-analyst`'s existing rule that a recommendation
without a falsifier is an opinion. Applying it to opportunities is what stops the lead
manufacturing work to look useful — a real tension, because the analyst is built to prevent
inventing questions after seeing the numbers, and the lead's job in Loop A is to look at
numbers and invent content ideas. The falsifier is the reconciliation.

---

## 4. Roster

| Subagent | Tier | Reads | Reports |
|---|---|---|---|
| `content-analyst` | strong | GA4, Search Console, Ahrefs, ESP | findings against `questions.yaml`, plus what it could not determine |
| `audience-researcher` | standard | support, comments, replies, on-site search, SERP intent | themes with volume and verbatim quotes |
| `market-researcher` | standard | competitor sites, category news, regulation | moves, gaps, and what changed since last run |
| `content-planner` | strong | the three reports; competitor pages when briefing | opportunities, then briefs in schema |
| `post-writer` | strong | the brief, `brand/`, source material | a draft |
| `reviewer` | strong | the draft, `brand/`, the brief | findings by severity; never edits |
| `asset-manager` | fast | approved media inventory | ranked candidate images with alt text |

Seven subagents, well inside the roster ceiling of 20 and the 25-thread limit.

Tiers follow `plan_big_execute_small`: the readers are cheap and parallel, the producers
and the judgment are expensive. `content-analyst` stays `strong` because arithmetic rigour
is the whole point of it.

### `content-analyst` loses its own schedule

Under this model it is roster-only. The lead's Loop A calls it. Keeping a standalone Monday
deployment as well would mean two things can trigger the same analysis and neither knows
about the other.

*Trade-off:* you lose a weekly read if the lead is broken. Acceptable — a broken lead is
something you want to notice, and a silently succeeding analyst hides it.

### `reviewer` never edits

It reports findings by severity and hands them back. The lead decides what to action. An
agent that both critiques and rewrites collapses two jobs and you lose the record of what
was objected to.

### `asset-manager` retrieves, never generates

`positioning.md` claims we publish the measurements, wins and setbacks alike; `voice.md`
says never greenwashed. A synthetic image of a paddock that does not exist is the fastest
available way to break the one thing the brand claims. Retrieval from approved inventory
only.

---

## 5. Containment

- **Nothing here publishes.** Drafts, seed files, backlog entries. No CMS merge, no send,
  no social post. This holds the no-irreversible-action line structurally rather than by
  relying on an approval gate firing.
- **The lead's only connector is the backlog.** MCP servers are agent-scoped, so declaring
  nothing else means the lead cannot reach analytics, the web, or media directly even if
  its reasoning goes sideways. It has to ask.
- **`market-researcher` is the only agent with web access.** It reads competitor material
  and reports on it. Everything it returns is data, never instruction — the same rule
  `content-analyst` already states about query results and page titles.
- **Vault credentials are session-scoped** even though MCP servers are agent-scoped. Since
  no subagent holds a write credential, there is nothing in the session vault for a
  compromised thread to reach. This is why keeping every subagent read-only-or-drafting
  matters more than it looks.

---

## 6. What the build needs

All five gaps are closed. A review against the published API contract on 03/08/2026 then
found the first pass had rendered several payloads in shapes the API does not accept; those
are corrected and noted below.

**a. Skills, discovered then silently dropped — fixed.** `claude.render()` emits a `skills`
array when the agent declares any.

*Correction:* the first fix emitted `[{name}]` from directory names. The API takes
`[{type: "anthropic"|"custom", skill_id, version?}]` — a directory name is not a skill id,
and Anthropic's pre-built skills have no directory at all. Skills are now declared one file
per skill under `skills/`, the same convention as connectors, and the test asserts the API
shape rather than the shape the code happened to produce.

**b. `subagents/` discovery — fixed.** `loadAgent` recurses one level into `subagents/`
and attaches the result to `AgentDefinition.subagents`. A subagent that declares its own
`schedules/` or `subagents/` fails the build with a named error rather than deploying with
the nested roster silently dropped — the platform ignores delegation past depth one.
`loadAll` itself is unchanged: it only reads `agents/*/agent.yaml`, so subagents nested
under `agents/content-marketer/subagents/*/agent.yaml` were never at risk of also loading
as top-level agents.

**c. `multiagent` in schema and render — fixed.** `agent.yaml` carries the roster's names
and version pins (not derivable from the filesystem); `loadAgent` cross-checks that set
against the directories actually found in `subagents/` in both directions — an entry with
no matching directory, or a directory with no matching entry, fails the build.

*Correction:* the first fix rendered `agents: [{ name, version }]`. The API has no
name-based reference at all; entries are `{type: "agent", id, version?}`. The renderer now
emits that shape with the id as a `${agent:<name>}` placeholder, which deploy substitutes
once that agent exists — the same discipline `${VAR}` already followed, extended to the one
other thing that cannot be known at build time.

**d. Deployments' opening message — fixed.** `prompt` is required in `schedule.schema.json`
(`minLength: 1`); no code path emits a deployment without one.

*Correction:* the first fix emitted `initial_events: [{type: 'user', message}]` and little
else. Checked against the Create Deployment contract, the payload was missing `agent`,
missing `environment_id` (required, with no account default to fall back on), used `user`
instead of `user.message`, passed the text as a string instead of a content-block array,
omitted the `schedule.type: "cron"` discriminator, and sent a `description` that is not a
deployment field. All corrected, and the deployment test now asserts each required field
rather than just the two that were there.

**e. Deploy ordering — fixed.** `packages/agent/src/publish/claude.ts` publishes subagents
first, then the coordinator with its roster resolved to real ids, then deployments. It is
idempotent by name: a re-run after a partial failure updates what exists rather than
creating a second copy, which is what makes the partial failure recoverable instead of
merely detectable. Existing deployments are skipped rather than rewritten — the API exposes
pause, unpause, archive and run but no documented update, and guessing a verb against a
live schedule is not worth the convenience.

Two things the publisher deliberately refuses to be clever about: a roster pin that no
longer matches the version just published is reported rather than silently re-pinned, and
any unresolved `${VAR}` stops the run before the first write rather than part-way through.

**Cursor and the coordinator roster.** `assertSupported` now has a `multiagent` capability
flag (`claude: true`, `cursor: false`) as the loud backstop the portability check was
always meant to be. In practice `content-marketer/agent.yaml` never declares a `cursor:`
key under `providers:` at all, and the build now treats an agent's `providers:` block as
which providers it targets, not only per-provider settings — so `pnpm build` skips cursor
for this coordinator cleanly rather than calling `render()` and hitting the backstop. The
backstop still fires if a future edit adds `providers.cursor` to a coordinator by mistake.
`content-marketer` is claude-only, and the build says so instead of emitting a degraded
cursor artifact — the outcome §6 originally asked for, reached by not attempting the
combination rather than by attempting and catching it.

---

## 7. Brand gap

Plugin skills read `brand-voice.md`, `taxonomy.md`, `hashtags.md` and
`seasonal-calendar.md`. `brand/` holds `voice.md` and `positioning.md`. One naming
mismatch, three missing files.

`positioning.md` also states agents read `dist/positioning.json` and never the source, with
every published piece recording the hash it was written under. `packages/brand` does not
exist — `.gitignore` reserves `packages/brand/dist/`, so the intent is recorded and the
implementation is not. `post-writer`, `reviewer` and `asset-manager` all depend on this.

---

## 8. Suggested order

1. ~~Fix the skills render gap (**6a**).~~ Done.
2. Port the three missing brand files, settle the naming. **Still open** — not blocking
   `content-analyst` or `market-researcher`, which only read `positioning.md`; blocks
   `post-writer`, `reviewer`, `asset-manager` in step 7.
3. ~~Build and deploy `content-analyst` standalone against the real GA4 connector.~~ Done
   prior to this phase; `content-analyst` has since moved to roster-only (§4) and lost its
   standalone schedule as part of step 5.
4. ~~Add `subagents/` discovery, `multiagent`, and the deployment message (**6b–d**).~~ Done.
5. **Done — this phase.** Lead stood up with a two-subagent roster — `content-analyst`
   and `market-researcher` — and Loop A only, writing opportunities (not full briefs) to
   the backlog. Backlog is Linear (`connectors/backlog.yaml`, `https://mcp.linear.app/mcp`).
   Schedule is monthly (`0 7 1 * * Australia/Sydney`), matching the cadence decision in §9.
   `audience-researcher` is deferred per §9 — Loop A runs on two research legs, not three.

   **Still needed before the first real run**, none of which are code:

   - a cloud **environment**, for `CLAUDE_ENVIRONMENT_ID`
   - a **vault** holding an `mcp_oauth` credential for `https://mcp.linear.app/mcp`, for
     `VAULT_ID_CONTENT_MARKETING`. Credentials are matched on exact server URL, and a
     missing one does not fail loudly: the session starts, emits a `session.error`, and
     the run looks like it happened
   - a hosted GA4 MCP endpoint for `ANALYTICS_MCP_URL`, which does not exist yet
   - `ANTHROPIC_API_KEY`

   `pnpm run deploy -- --provider claude --dry-run` lists whichever of these are still
   unset without touching the account, so it is the cheapest way to check.
6. Add `content-planner` and the full brief schema (title/cluster/claim/baseline/horizon/
   confidence/falsifier/evidence/status). Until then the lead itself writes a reduced
   opportunity shape directly (see its `instructions.md`) — no `status: ready`, no brief.
7. Add `post-writer`, `reviewer`, `asset-manager`. Loop B. Needs step 2 first.

Step 3 remains the real test. `draft-post` says *"Pass the post slug after the skill name"* —
phrasing for a human at a keyboard, with no equivalent for a scheduled run. If every skill
needs rewriting to work unattended, these are forks rather than a shared library, and the
sync question answers itself.

---

## 9. Decisions needed

1. **Backlog system** — Linear.
2. **Loop cadences** — Monthly discovery, weekly production.
3. **`content-analyst` roster-only, or keep a standalone schedule too?** Roster-only.
4. **Does the lead hold `web_search`?** No.
5. **What does `audience-researcher` actually read?** Defer sub-agent for now.
