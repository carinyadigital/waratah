# `content-marketer` — team design for review

**Status:** draft, for JD review. Nothing built.
**Date:** 02/08/2026
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

Five gaps between this design and `packages/agent` today.

**a. Skills are discovered, then silently dropped.** `load.ts` walks `agents/<name>/skills/`
and populates `agent.skills`; `assertSupported` checks `supports.skills`; `claude.render()`
never emits them. An agent with skills builds clean, passes `build:check`, and deploys
without them. The only test coverage asserts that *cursor* rejects skills — nothing asserts
claude renders them. This is the silent degradation the README says the build refuses to
allow, and it blocks all plugin-skill reuse.

**b. `subagents/` discovery.** `loadAll` treats every directory under `agents/` as a
top-level agent. It needs to recurse one level into `subagents/` and attach them to the
lead, with validation that a subagent declares no schedules and no roster of its own —
the platform ignores delegation past depth one, so a nested roster should fail the build
rather than deploy silently ignored.

**c. `multiagent` in schema and render.**

```yaml
multiagent:
  type: coordinator
  agents:
    - name: content-analyst
      version: 3
```

Render by name; resolve to agent id at deploy. Ids are account-specific and must not be
committed. The version pin must be, because the roster pin is what stops a subagent bump
silently changing what the lead calls.

**d. Deployments are missing their opening message.** The API requires `initial_events`
with a `user.message`. The current render emits `name`, `description`, `schedule` and an
optional `prompt`. `prompt` becomes that message and should be required here — the two
loops are the same agent differing only in how the run opens.

**e. Deploy ordering.** Subagents must be created first to obtain ids, then the coordinator
with the resolved roster, then the deployments. A partial failure halfway leaves a
coordinator pointing at nothing, so the publisher needs to be idempotent and re-runnable.

*Also worth knowing:* cursor cannot express a coordinator roster, so `assertSupported` will
fail the cursor build for this team. That is the portability check working as designed, not
a defect — but it does mean `content-marketer` is claude-only, and the build should say so
rather than emit a degraded cursor artifact.

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

1. Fix the skills render gap (**6a**). Nothing else matters until a skill reaches a deployed agent.
2. Port the three missing brand files, settle the naming.
3. Build and deploy `content-analyst` standalone against the real GA4 connector. Prove one worker works unattended before building six more.
4. Add `subagents/` discovery, `multiagent`, and the deployment message (**6b–d**).
5. Stand up the lead with a two-subagent roster — `content-analyst` and `market-researcher` — and Loop A only, writing opportunities to the backlog. No briefs, no production.
6. Add `content-planner` and the brief schema. Loop A complete.
7. Add `post-writer`, `reviewer`, `asset-manager`. Loop B.

Step 3 remains the real test. `draft-post` says *"Pass the post slug after the skill name"* —
phrasing for a human at a keyboard, with no equivalent for a scheduled run. If every skill
needs rewriting to work unattended, these are forks rather than a shared library, and the
sync question answers itself.

---

## 9. Decisions needed

1. **Backlog system** — Linear recommended, needs authorising. Notion and Sheets both work; the brief schema matters more than the tool.
2. **Loop cadences** — proposed fortnightly discovery, weekly production. Discovery is the expensive one.
3. **`content-analyst` roster-only, or keep a standalone schedule too?** Recommending roster-only (§4).
4. **Does the lead hold `web_search`?** Recommending no — a lead that can research is a lead that will start doing the work instead of judging it.
5. **What does `audience-researcher` actually read?** Support, comments, replies and on-site search all imply sources that may not exist yet for Carinya Parc. This may be the subagent to defer.
