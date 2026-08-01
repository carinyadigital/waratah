---
type: Tasks
practice: content
level: epic+story+task
version: '2.1'
owner: jonno
status: Draft
last_updated: 2026-08-01
source: design.md
related:
  - design.md
  - ../product.md
  - ../architecture.md
linear:
  team: CON
  synced: false
---

# Content Agents — Delivery

**Source.** `design.md`. Product outcomes cite `../product.md` §3.

**Structure.** Epics → stories → tasks in one file. There is no separate backlog while there is one practice; the epic table below is that layer. **Revisit when a second practice ships** — at that point cross-practice sequencing has nowhere to live.

**Changed from the previous backlog.** Three new epics (CNT09, CNT10, CNT11). CNT02 gains the `read` schema, `positioning.md`, and the n-threshold gate. CNT04 gains the review record. Build order re-sequenced by feedback speed, which moves CNT09 ahead of CNT05–CNT07 and CNT10 later than its value would suggest.

---

## 1. Summary

**Total.** 123 points across 11 epics, 39 stories, 87 tasks. **Now phase:** 55 points across 4 epics, in one team — `CON`.

**Decomposition depth.** Every epic is decomposed to story level with Gherkin acceptance criteria, and to task level with estimates. Task-level detail for the Later phase (CNT07, CNT08, CNT10, CNT11) is **provisional** — those epics depend on what CNT04 and CNT09 teach, and their estimates should be re-cut before they are committed to a sprint. The story shape is stable; the tasks beneath are a first pass.

**MVP is CNT01-S1** — the agent identity exists and can stage a draft over REST. Everything after it is a constraint on a capability that already works.

**Critical path.** `CNT01 → CNT03 → CNT04 → CNT08`, 55 points. CNT01 and CNT02 are independent — start both. CNT06 depends on nothing and fits any gap.

---

## 2. Epics

| ID | Epic | Outcome | Phase | Pri | Pts | Depends | Status |
|---|---|---|---|---|---|---|---|
| **CNT01** | Publishing Guardrails | Nothing reaches readers without a human deciding it should | Now | P0 | 13 | — | Verified complete — 10/10 tasks pass (validation 2026-08-01) |
| **CNT02** | Content Contracts | Published claims are traceable to a source, and prohibited claims cannot ship | Now | P0 | 13 | — | Verified complete — 10/10 tasks pass (validation 2026-08-01) |
| **CNT03** | Content QA | The guarantees in CNT01 and CNT02 cannot be silently weakened | Now | P0 | 8 | CNT01, CNT02 | In-progress — 6/7 pass; CNT03-03 unverifiable from code (live GitHub branch-protection state), see G6 |
| **CNT04** | Authoring Studio | A brief becomes a reviewable draft without a human writing the first version | Now | P1 | 21 | CNT01, CNT02 | In-progress — 10/13 pass; CNT04-02 no evidence of an executed deploy, CNT04-09 not enforced at Payload publish, CNT04-13 no Slack trigger handler in repo, see G7 |
| **CNT09** | Corpus Invariants | The corpus stays true to itself without anyone remembering to check | Next | P1 | 8 | CNT02 | In-progress — 7/8 pass; CNT09-06 external-link invariant wrapper untested end to end, see G8 |
| **CNT05** | Register Rules | The register's policy assertions are machine-checked rather than aspirational | Next | P1 | 8 | CNT03 | Verified complete — 6/6 tasks pass (validation 2026-08-01) |
| **CNT06** | Capture | An idea is never lost between having it and writing it | Next | P2 | 5 | — | Verified complete — 3/3 tasks pass (validation 2026-08-01) |
| **CNT10** | Intelligence Layer | Evidence about what is working exists, is auditable, and is not narrated noise | Later | P1 | 13 | CNT04, CNT09 | In-progress — 8/9 pass; CNT10-02 no evidence of an executed deploy, see G9 |
| **CNT07** | Commissioning | What we write about is chosen from evidence rather than from whoever spoke last | Later | P2 | 13 | CNT10 | In-progress — 5/8 pass; CNT07-02 no evidence of an executed deploy, CNT07-04 landscape has no producer, CNT07-06 collision check covers briefs only not published corpus, see G10 |
| **CNT11** | Review Calibration | Review moves from human to agent on measured agreement, not on faith | Later | P2 | 8 | CNT04 | In-progress — 5/6 pass; CNT11-04 mechanism verified but no live review records exist yet, see G11 |
| **CNT08** | Distribution | Published work reaches its audience without a human rewriting it per channel | Later | P3 | 13 | CNT01, CNT04 | In-progress — 6/7 pass; CNT08-07 no cluster-level attribution, see G12 |

**Sequencing note.** CNT10 is the most valuable epic in the practice and is eighth. That is deliberate — see `design.md` §11. Until there is a corpus and a review record, the analyst has nothing to be right about, and no way to tell whether it is.

---

## 3. CNT01 — Publishing Guardrails

**Scope.** A Payload identity content agents authenticate as, which can stage drafts and cannot publish, cannot change the join key or public URL, and is attributable in version history. All enforcement is access control evaluated server-side, in code, in the site repo.

**Out of scope.** Any deployed agent — nothing calls this yet, deliberately. The gates and schemas (CNT02). The register-side generalisation (CNT05). A narrow Local API endpoint — deferred, see CNT01-10.

**Why first.** Roughly twenty lines of TypeScript that convert the design's central claim from an assertion into a server-side guarantee. Every later epic inherits it.

**Source.** `design.md` §6.1–6.3, ADR-0001, ADR-0003.

### CNT01-S1 — The agent identity exists and can stage *(MVP, 3 pts)*

```gherkin
Given a user in the users collection with role "agent" and useAPIKey enabled
When a POST is made to /api/posts with that API key and _status "draft"
Then the document is created
And Payload version history attributes it to the agent identity
```

| Task | Description | Pts |
|---|---|---|
| CNT01-01 | Add `agent` to the `users` collection role enum; enable `useAPIKey` | 1 |
| CNT01-02 | Enable `versions: { drafts: true }` on `posts` and `recipes` | 1 |
| CNT01-03 | Document the staging REST call in `docs/agent-publishing.md` | 1 |

> `[NEEDS CLARIFICATION]` Collection names `posts` and `recipes` are assumed from the plugin's `draft-post` and `draft-recipe` skills. Confirm against `src/collections/`.

### CNT01-S2 — The agent cannot publish *(5 pts)*

Written in EARS because the constraint is conditional and always-on.

```gherkin
Given a request authenticated as the agent role
When that request attempts to set _status to "published"
Then the update is denied by collection-level access control
And the denial occurs server-side regardless of API surface
And the Admin UI hides Publish and Unpublish for that user
```

| Task | Description | Pts |
|---|---|---|
| CNT01-04 | `src/access/agentCannotPublish.ts` — collection `update` access returning a query constraint on `_status` | 2 |
| CNT01-05 | Wire the access function into `posts` and `recipes` | 1 |
| CNT01-06 | Integration test: agent key staging succeeds, publishing returns denied | 2 |

**Note the asymmetry** — collection-level access returns a query constraint, field-level returns only a boolean. The publish block must be at collection level.

### CNT01-S3 — The join key and URL are locked *(3 pts)*

```gherkin
Given a request authenticated as the agent role
When that request attempts to update the title or slug field
Then the field update is denied
And the rest of the document update proceeds
```

| Task | Description | Pts |
|---|---|---|
| CNT01-07 | Field-level `update: false` on `title` and `slug` for the agent role | 1 |
| CNT01-08 | Test asserting partial-update semantics — locked fields denied, others written | 2 |

### CNT01-S4 — Key lifecycle *(2 pts)*

```gherkin
Given the agent API key is rotated or disabled
When the agent next authenticates
Then the request fails
And no other identity's access is affected
```

| Task | Description | Pts |
|---|---|---|
| CNT01-09 | Document rotation in `config/connections.yaml` under the `payload` connection, with owner and cadence | 1 |
| CNT01-10 | ADR note: no Local API endpoint is exposed. Record why, and the conditions under which a narrow one would be written. | 1 |

---

## 4. CNT02 — Content Contracts

**Scope.** The standards layer, three schemas, and seven deterministic gates — shipped as skills in the `content-marketing` plugin and driven **by hand in Cowork**. No deployment.

**Why here.** Schemas are cheapest to be wrong about before anything consumes them. **Writing two real pieces by hand is the validation**, and the plugin makes that possible without deploying an agent.

**Source.** `design.md` §1, §4, §5.

### CNT02-S1 — The standards layer exists *(3 pts)*

```gherkin
Given packages/brand/src contains positioning, voice, claim policy, rubric, banned words and surface specs
When the brand package is built
Then dist artifacts are generated
And positioning.md produces a stable hash consumable by agents and gates
```

| Task | Description | Pts |
|---|---|---|
| CNT02-01 | Write `positioning.md` — new. Who we're for, what we claim, where we compete. | 1 |
| CNT02-02 | Write `claim-policy.md` — the categories never asserted without a primary source. ACCC-exposed environmental claims first. | 1 |
| CNT02-03 | `build.ts` emits `positioning.json` with a content hash | 1 |

> **CNT02-02 is the highest-consequence hour in the Now phase.** Everything the prohibition gate can catch is defined here, and a regenerative-land claim shipped without a source is the one failure with regulatory teeth.

### CNT02-S2 — The three schemas *(5 pts)*

```gherkin
Given brief, pack and read schemas in packages/content-pipeline
When an artifact is written to .agency/content/
Then it validates against its schema
And required-by-omission fields are rejected when absent
```

| Task | Description | Pts |
|---|---|---|
| CNT02-04 | `brief.schema.json` — incl. `positioningHash`, `expiresAt`, `sourceBudget` | 2 |
| CNT02-05 | `pack.schema.json` — `couldNotVerify` required, not empty by omission | 1 |
| CNT02-06 | `read.schema.json` — pre-registered `questions`, per-figure `query` and `n`, `alternativeExplanations` and `couldNotDetermine` required | 2 |

### CNT02-S3 — The gates *(5 pts)*

```gherkin
Given a Payload draft and its pack artifact
When the gate suite runs
Then every annotated claim resolves to a pack entry
And every mustSupport entry appears in the document
And nothing matches mustNotClaim or a claim-policy pattern
And the run makes no model calls
```

| Task | Description | Pts |
|---|---|---|
| CNT02-07 | Lexical inline `claim` feature carrying `claimId` | 2 |
| CNT02-08 | Claim coverage gate — walks editor JSON, checks both directions | 1 |
| CNT02-09 | Prohibition, style lint, links, structure, readability, brief conformance | 1 |
| CNT02-10 | **Write two pieces by hand end to end.** Expect both to fail. Fix the gates, not the pieces. | 1 |

> **CNT02-10 is the acceptance test for the whole epic.** If the two hand-written pieces pass first time, the gates are too weak.

---

## 5. CNT03 — Content QA *(8 pts)*

**Scope.** A GitHub Actions workflow doing two jobs: re-running the gates on the artifacts PR **and on the merge commit**, and asserting the CNT01 access rules still deny publish to the agent role.

**Why the merge commit matters.** A gate that only runs pre-merge can be routed around by force-push or admin merge. The guarantee is worth having only if it cannot be skipped.

**Source.** `design.md` §5, §6.2.

### CNT03-S1 — Gates run where they cannot be skipped *(3 pts)*

```gherkin
Given a pull request touching .agency/content/ or a Payload draft
When CI runs
Then the full gate suite executes and reports per-gate status
And the same suite re-runs on the merge commit
And a failing gate blocks the merge via branch protection
```

| Task | Description | Pts |
|---|---|---|
| CNT03-01 | `.github/workflows/content-qa.yml` running the gate suite on `pull_request` | 1 |
| CNT03-02 | Merge-commit job on `push` to main, same suite, no skip path | 1 |
| CNT03-03 | Branch protection requiring the check | 1 |

### CNT03-S2 — The CNT01 guarantee is checked continuously *(3 pts)*

```gherkin
Given the agent role's access rules exist in the site repo
When CI runs
Then a test asserts the agent role cannot set _status to published
And the test fails if the access function is removed, renamed, or weakened
```

| Task | Description | Pts |
|---|---|---|
| CNT03-04 | Integration test asserting publish denial for the agent role | 2 |
| CNT03-05 | Wire into `content-qa.yml`; fail the workflow on regression | 1 |

**Deliberately narrow.** CNT05 generalises this into R9 in the register CLI once a second agent needs it. Shipping the specific test first is cheaper than shipping the mechanism.

### CNT03-S3 — Failures are legible without opening logs *(2 pts)*

```gherkin
Given the gate suite has run
When results are posted
Then a PR comment carries per-gate status
And the couldNotVerify list from the pack appears in full
And the comment updates in place rather than accumulating
```

| Task | Description | Pts |
|---|---|---|
| CNT03-06 | PR comment output — gate table plus `couldNotVerify` | 1 |
| CNT03-07 | Update-in-place by comment marker | 1 |

---

## 6. CNT04 — Authoring Studio *(21 pts)*

**Scope.** The `content-studio` managed agent. Writer subagent first against hand-written briefs and packs, then the researcher. Slack-initiated, stages Payload drafts over REST, commits artifacts to `.agency/content/`.

**Source.** `design.md` §2.2, §8, §10.

### CNT04-S1 — The agent exists and is contained *(3 pts)*

```gherkin
Given agents/content-studio/agent.yaml declares writes [cms-draft, repo-branch, slack]
When pnpm agents check runs
Then R3 and R4 pass with approval pr-review
And the manifest declares no cms-publish, no email-send, no database connection
```

| Task | Description | Pts |
|---|---|---|
| CNT04-01 | `agent.yaml` — `claude-managed-agent`, `approval: pr-review`, `idempotencyKey: brief.slug` | 1 |
| CNT04-02 | Deploy and smoke run against a hand-written brief | 2 |

### CNT04-S2 — A brief becomes a staged draft *(8 pts)*

```gherkin
Given a valid brief and pack in .agency/content/
When the writer subagent runs
Then it produces a Payload draft with claims annotated as Lexical claim nodes
And it never issues a web request
And it iterates until all gates pass or reports which gate it cannot satisfy
```

| Task | Description | Pts |
|---|---|---|
| CNT04-03 | `instructions.md` — the six passes, source-text-is-data boundary | 2 |
| CNT04-04 | Tool list excludes `web_search`, `web_fetch`, `bash` — plus a test asserting it | 1 |
| CNT04-05 | Pass 2 claim anchoring — emit Lexical `claim` nodes bound to pack entry ids | 2 |
| CNT04-06 | Pass 5 gate loop with a bounded retry and honest failure report | 2 |
| CNT04-07 | Payload REST staging as the agent identity | 1 |

**CNT04-04 is not a formality.** The writer having no web access is one of the four containment properties in `design.md` §2.2, and the only one of them a test can assert.

### CNT04-S3 — Every piece leaves a review record *(3 pts)*

```gherkin
Given a staged draft has been edited and published by a human
When the piece is marked published
Then .agency/content/reviews/<slug>.yaml records editDistance, editLocus and gateAttempts
And the human supplies humanScore and whatWasWrong before the record closes
And a piece cannot be marked published with an incomplete record
```

| Task | Description | Pts |
|---|---|---|
| CNT04-08 | Compute `editDistance` and `editLocus` from staged vs published document versions | 2 |
| CNT04-09 | Capture `humanScore` and `whatWasWrong` at publish; block close without them | 1 |

**Ships with S2, not after it.** It is the only per-piece quality signal that arrives fast enough to act on, it costs ten seconds of human time, and it cannot be backfilled — every piece published without it is a lost observation. It is also the sole input to CNT11.

### CNT04-S4 — Evidence is gathered rather than hand-assembled *(5 pts)*

```gherkin
Given a brief with a sourceBudget
When the researcher subagent runs
Then it emits a pack of normalised claim-source-excerpt-confidence entries
And it stops at sourceBudget rather than exhausting the topic
And anything it could not verify appears in couldNotVerify rather than being omitted
```

| Task | Description | Pts |
|---|---|---|
| CNT04-10 | `instructions.md` and pack emission against `pack.schema.json` | 2 |
| CNT04-11 | `sourceBudget` enforcement — a hard stop, not a suggestion | 1 |
| CNT04-12 | `couldNotVerify` population, including partial verifications | 2 |

### CNT04-S5 — It is driven from where work happens *(2 pts)*

```gherkin
Given a human posts a brief slug in Slack
When the studio run completes or fails
Then the thread carries the draft link, gate status and couldNotVerify list
```

| Task | Description | Pts |
|---|---|---|
| CNT04-13 | Slack initiation and threaded run report | 2 |

---

## 7. CNT09 — Corpus Invariants *(8 pts)*

**Scope.** `content-monitor` — weekly, deterministic, no model calls. Files violations into Triage. **Work is generated by drift, not by a planning meeting.**

**Source.** `design.md` §7, §10.2.

### CNT09-S1 — The monitor runs and files *(3 pts)*

```gherkin
Given content-monitor is deployed on a weekly schedule
When it detects an invariant violation
Then a tracker item is filed into Triage naming the invariant, the page and the evidence
And re-running produces no duplicate for an unresolved violation
And a push to packages/brand/** triggers an immediate re-check
```

| Task | Description | Pts |
|---|---|---|
| CNT09-01 | `agent.yaml` and `.github/workflows/content-monitor.yml` | 1 |
| CNT09-02 | Triage filing with `idempotencyKey: invariant.id+page` | 1 |
| CNT09-03 | Push trigger on `packages/brand/**` | 1 |

### CNT09-S2 — Structural invariants *(3 pts)*

```gherkin
Given the published corpus and .agency/content/
When the structural checks run
Then every published document has a brief and a pack
And every targetQuery maps to exactly one canonical page
And every page has at least one internal link in
And every external link resolves
```

| Task | Description | Pts |
|---|---|---|
| CNT09-04 | Slug join across CMS and artifacts; orphan detection both directions | 1 |
| CNT09-05 | `targetQuery` uniqueness across briefs | 1 |
| CNT09-06 | Internal link graph reachability; external link resolution | 1 |

**CNT09-05 is the cannibalisation check.** Two pages targeting one query is the most common self-inflicted SEO wound and the hardest to notice by hand.

### CNT09-S3 — Freshness invariants *(2 pts)*

```gherkin
Given claim-policy.md defines source-age limits per claim category
When the freshness checks run
Then any regulated claim whose source is older than its limit is flagged
And any page whose positioningHash predates the current hash is flagged
And any page unreviewed past its surface decay half-life is flagged
```

| Task | Description | Pts |
|---|---|---|
| CNT09-07 | `verifiedAt` age check against claim-policy categories | 1 |
| CNT09-08 | Positioning hash compare and decay half-life sweep | 1 |

---

## 8. CNT05 — Register Rules *(8 pts)*

**Scope.** Generalise the CNT03 access assertion into the register CLI, add the database prohibition, and implement the `content:` manifest block so R11 becomes enforceable.

**Source.** `architecture.md` §6, ADR-0003.

### CNT05-S1 — R9: cms-draft implies an asserted role *(3 pts)*

```gherkin
Given an agent manifest declaring writes cms-draft
When pnpm agents check runs
Then the manifest must name a CMS role
And a test asserting that role's access rules must exist in the site repo
And check fails if the named test is absent
```

| Task | Description | Pts |
|---|---|---|
| CNT05-01 | `cmsRole` field in the manifest schema | 1 |
| CNT05-02 | R9 in the CLI — resolve the named assertion test | 2 |

### CNT05-S2 — R10: no direct database access *(2 pts)*

```gherkin
Given an agent tagged content
When pnpm agents check runs
Then check fails if policy.connections names a database connection
```

| Task | Description | Pts |
|---|---|---|
| CNT05-03 | Classify connections in `connections.yaml` with a `kind` field | 1 |
| CNT05-04 | R10 in the CLI | 1 |

**This is the rule most likely to be broken by someone being helpful during a debugging session.** It cannot check what a deployed agent actually holds — it makes the violation visible in a diff, which is the available guarantee.

### CNT05-S3 — The `content:` block becomes real *(3 pts)*

```gherkin
Given a manifest with a content block
When pnpm agents check runs
Then the block validates against $defs in agent.schema.json
And any agent emitting a read artifact must declare content.nThreshold per source
```

| Task | Description | Pts |
|---|---|---|
| CNT05-05 | `$defs` for `content:` — voice, rubric, positioning, nThreshold, clusters | 2 |
| CNT05-06 | R11 in the CLI | 1 |

---

## 9. CNT06 — Capture *(5 pts)*

**Scope.** The path from having an idea to it being in the queue, and the sweep that stops the queue becoming a graveyard.

### CNT06-S1 — An idea reaches Triage in one step *(3 pts)*

```gherkin
Given a human posts an idea in Slack with a capture trigger
When the capture runs
Then a Triage item is created carrying the raw text and its author
And no interpretation, expansion or prioritisation is applied
```

| Task | Description | Pts |
|---|---|---|
| CNT06-01 | Slack capture to Triage | 2 |
| CNT06-02 | Raw-text preservation — capture must not summarise | 1 |

**CNT06-02 matters more than it looks.** A capture step that rewrites the idea loses the thing that made it worth capturing, and there is no way to recover the original.

### CNT06-S2 — Stale briefs expire *(2 pts)*

```gherkin
Given a brief with an expiresAt date has not been started
When the weekly sweep runs
Then the brief is marked expired and its tracker item moved out of the ready queue
And the expiry is reported rather than silent
```

| Task | Description | Pts |
|---|---|---|
| CNT06-03 | Expiry sweep and report | 2 |

---

## 10. CNT10 — Intelligence Layer *(13 pts)*

**Scope.** `content-analyst`. Read-only across GA4, Search Console, Ahrefs and the ESP. Emits `read` and `demand` artifacts. Recommends into Triage, never into the backlog.

**Source.** `design.md` §2.1, §4.3–4.5, §10.1.

### CNT10-S1 — The analyst exists and is read-only *(2 pts)*

```gherkin
Given agents/content-analyst/agent.yaml
When pnpm agents check runs
Then writes are limited to artifact-store, tracker and slack
And no payload, repo-branch or send capability is declared
And content.nThreshold is declared per connected source
```

| Task | Description | Pts |
|---|---|---|
| CNT10-01 | `agent.yaml` with `spendCapUsd: 60` and `idempotencyKey: read.period` | 1 |
| CNT10-02 | Deploy and smoke run against one pre-registered question | 1 |

### CNT10-S2 — Findings are auditable *(5 pts)*

```gherkin
Given a set of pre-registered questions
When the analyst runs
Then every figure in the read artifact carries its exact query, n and window
And every finding carries at least one alternative explanation
And anything undeterminable appears in couldNotDetermine rather than being omitted
And exploratory findings are labelled and carry no recommendation alone
```

| Task | Description | Pts |
|---|---|---|
| CNT10-03 | Question pre-registration — read from a config, not invented per run | 2 |
| CNT10-04 | Per-figure query capture and re-runnability | 2 |
| CNT10-05 | Alternative-explanation and `couldNotDetermine` enforcement at write | 1 |

**CNT10-03 is the defence against post-hoc story fitting.** An analyst that chooses its own questions after seeing the data will find a cause every time.

### CNT10-S3 — Noise cannot be narrated *(2 pts)*

```gherkin
Given a figure whose n falls below the declared threshold for its source
When the analyst writes a finding using it
Then the figure may be reported
And any directional claim on that figure is rejected at write
```

| Task | Description | Pts |
|---|---|---|
| CNT10-06 | n-threshold gate on `read` artifact write | 2 |

### CNT10-S4 — Demand signals are gathered *(2 pts)*

```gherkin
Given enquiry themes from support-triage, on-site search and SERP intent
When the audience researcher runs
Then a demand artifact records jobs-to-be-done and the language people actually use
And each theme carries its source and frequency
```

| Task | Description | Pts |
|---|---|---|
| CNT10-07 | `demand.schema.json` and emission | 2 |

### CNT10-S5 — Recommendations are falsifiable *(2 pts)*

```gherkin
Given a recommendation in a read artifact
Then it carries a claim, baseline, horizon, confidence and ifWrong
And at horizon the prediction is scored regardless of whether anyone asked
And the ratio of periods recommending nothing is tracked
```

| Task | Description | Pts |
|---|---|---|
| CNT10-08 | Prediction record and horizon scoring job | 1 |
| CNT10-09 | "Recommend nothing" ratio in the run report | 1 |

**CNT10-09 is a one-line metric that catches the failure this epic most invites.** An analyst that proposes work every period is justifying, not analysing.

---

## 11. CNT07 — Commissioning *(13 pts)*

**Scope.** `content-planner`. Monthly. Synthesises intelligence into ranked opportunities, writes briefs, and maintains a capped ready queue that a human promotes into.

**Source.** `design.md` §2.1, §4.1.

### CNT07-S1 — The planner exists on a monthly clock *(2 pts)*

```gherkin
Given agents/content-planner/agent.yaml
When pnpm agents check runs
Then writes are limited to artifact-store, tracker and slack
And no CMS or repo capability is declared
```

| Task | Description | Pts |
|---|---|---|
| CNT07-01 | `agent.yaml`, monthly schedule, `approval: draft-only` | 1 |
| CNT07-02 | Deploy and smoke run | 1 |

### CNT07-S2 — Evidence becomes ranked opportunities *(5 pts)*

```gherkin
Given the latest read, demand and landscape artifacts and current positioning
When the synthesist runs
Then an opportunities artifact ranks candidates with the evidence each rests on
And any opportunity contradicting current positioning is excluded with a reason
And opportunities carry a stated bet, not only a topic
```

| Task | Description | Pts |
|---|---|---|
| CNT07-03 | `opportunities.schema.json` — evidence refs, stated bet, exclusion reasons | 2 |
| CNT07-04 | Synthesis across the three inputs plus positioning hash | 3 |

### CNT07-S3 — An opportunity becomes a brief *(3 pts)*

```gherkin
Given a selected opportunity
When the commissioner runs
Then a brief validating against brief.schema.json is written
And targetQuery does not collide with an existing brief or published page
And positioningHash and expiresAt are set
```

| Task | Description | Pts |
|---|---|---|
| CNT07-05 | Brief generation from an opportunity | 2 |
| CNT07-06 | `targetQuery` collision check at write — CNT09-05 applied earlier | 1 |

### CNT07-S4 — The queue is capped and human-promoted *(3 pts)*

```gherkin
Given the ready queue is at its cap
When the planner proposes a new brief
Then the brief is filed into Triage and not into the ready queue
And promotion into the ready queue requires a human
And no agent may set priority
```

| Task | Description | Pts |
|---|---|---|
| CNT07-07 | Queue cap as a policy field, checked at write | 2 |
| CNT07-08 | Promotion gate — agent may file to Triage only | 1 |

**S4 is the epic's real content.** Generating briefs is easy; a capped queue is what makes commissioning a choice between options rather than a rubber stamp on everything proposed.

---

## 12. CNT11 — Review Calibration *(8 pts)*

**Scope.** The mechanism by which a decision class moves up the review ladder on measured agreement. Not a reviewer — the record that would justify trusting one.

**Source.** `design.md` §9, R12.

### CNT11-S1 — Decision classes are named and levelled *(2 pts)*

```gherkin
Given a register of decision classes with a current review level
When a class is queried
Then its level, sample size and last review date are returned
And every class starts at the level recorded in design.md §9.2
```

| Task | Description | Pts |
|---|---|---|
| CNT11-01 | `decision-classes.yaml` — class, level, threshold, window | 1 |
| CNT11-02 | Seed from `design.md` §9.2 starting positions | 1 |

### CNT11-S2 — Shadow verdicts are logged *(3 pts)*

```gherkin
Given a decision class at level 1
When an item requiring that decision is reviewed
Then the agent's verdict is recorded before the human decides
And the human does not see the agent verdict while deciding
And both verdicts are stored against the item
```

| Task | Description | Pts |
|---|---|---|
| CNT11-03 | Shadow verdict capture, hidden from the human reviewer | 2 |
| CNT11-04 | Paired storage against the review record from CNT04-S3 | 1 |

**CNT11-03's hiding requirement is the whole validity of the exercise.** A human who sees the agent's verdict first is no longer an independent measurement.

### CNT11-S3 — Levels move on evidence, automatically *(3 pts)*

```gherkin
Given a decision class with agreement above threshold across a full window and no severe miss
Then the class is promoted one level and the change is logged
Given a severe miss on any class
Then the class drops two levels immediately and the change is logged
And pnpm agents check fails for any class at level 3 or above without a qualifying record
```

| Task | Description | Pts |
|---|---|---|
| CNT11-05 | Agreement rate computation per class over a rolling window | 2 |
| CNT11-06 | Automatic promotion and demotion; R12 in the CLI | 1 |

---

## 13. CNT08 — Distribution *(13 pts)*

**Scope.** `content-distributor`. The only agent that can reach an audience, and the only one whose every action is irreversible.

**Source.** `design.md` §10, `product.md` §4.

### CNT08-S1 — Nothing sends without a human *(3 pts)*

```gherkin
Given agents/content-distributor/agent.yaml declares email-send and social-post
When pnpm agents check runs
Then R4 requires approval human
And check fails for any weaker approval setting
```

| Task | Description | Pts |
|---|---|---|
| CNT08-01 | `agent.yaml` with `approval: human`, spend cap, idempotency key | 1 |
| CNT08-02 | Approval flow — a human confirms each send, per send | 2 |

### CNT08-S2 — Published work is adapted, not rewritten *(5 pts)*

```gherkin
Given a published document and a target surface spec
When the distributor runs
Then a per-surface adaptation is drafted against that surface's voice rules
And no claim absent from the source document appears in the adaptation
And each adaptation links back to the canonical page
```

| Task | Description | Pts |
|---|---|---|
| CNT08-03 | Per-surface adaptation against `packages/brand/src/surfaces/` | 3 |
| CNT08-04 | Claim-superset check — adaptations may only narrow | 2 |

**CNT08-04 exists because adaptation is where unsourced claims get introduced.** A shorter version written for a different audience is exactly the moment a hedge gets dropped.

### CNT08-S3 — The newsletter path *(3 pts)*

```gherkin
Given a published piece designated for the newsletter
When the distributor drafts the send
Then the draft exists in the ESP unsent
And subscriber-facing metrics are recorded against the piece for the per-piece metric
```

| Task | Description | Pts |
|---|---|---|
| CNT08-05 | ESP draft creation, never send | 2 |
| CNT08-06 | Engaged open and unsubscribe capture as guardrail metrics | 1 |

**This is the delivery surface for the primary metric.** Subscribers is the thing the whole practice is measured on, and this is the only epic that touches it directly.

### CNT08-S4 — Sends are attributable *(2 pts)*

```gherkin
Given a send has occurred
Then a record links the send to its source piece, surface and approver
And per-piece subscriber attribution is available to content-analyst by cluster
```

| Task | Description | Pts |
|---|---|---|
| CNT08-07 | Send record and attribution back to the slug | 2 |

---

## 14. Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | Lexical inline-feature API cannot carry a stable `claimId` | Claim coverage stops being deterministic — the single most valuable gate | Spike CNT02-07 before committing CNT02-08. Fallback: a sibling `claims` array field with character offsets. |
| R2 | Claude Managed Agents beta changes scheduled-run semantics | CNT04, CNT10 rework | Manifest insulation. ADR-0002 revisit trigger. |
| R3 | Someone grants a database credential during debugging | Every CNT01 guarantee becomes decorative | R10 in CI (CNT05). Until then, ADR-0003 and vigilance — which is not a control. |
| R4 | Two pieces by hand reveal the brief schema is wrong | CNT02 rework | That is the point of CNT02-10. Budgeted, not a risk to avoid. |
| R5 | Review record is skipped under time pressure | CNT11 has no data; the improvement loop never closes | Make it a required field on the publish checklist, not an optional artifact |
| R6 | The analyst ships and narrates noise convincingly | Wrong topics commissioned for a quarter | n-threshold gate (CNT10); "recommend nothing" ratio tracked |
| R7 | No product outcome to cite | Prioritisation ungrounded the moment work exceeds capacity | `product.md` §3.1 names it. Unresolved. |

---

## 15. Gaps

| # | Gap | Blocks |
|---|---|---|
| G1 | **No business strategy for Carinya Parc.** Epics cite workforce outcomes, not business outcomes. Subscribers toward what end is unwritten. | Prioritisation, not delivery |
| G2 | Payload collection names assumed as `posts` and `recipes` | CNT01-01, CNT02-09 |
| G3 | Plugin version pinned as `1.4.0` throughout; unconfirmed | Every `skills.plugin` pin |
| G4 | Subscriber target figures unset | CNT10 success criteria |
| G5 | Owners unassigned — manifests name `jonno` as agent owner, no delivery owner | Every task carries `Owner: TBD` |
| G6 | Branch protection on `main` cannot be confirmed from the repo — `scripts/setup-branch-protection.sh` and `docs/branch-protection.md` exist but live GitHub state is unverifiable from code | CNT03-03 |
| G7 | `content-studio` has no CI/deploy-log evidence of an executed deploy or smoke run (`scripts/agents/smoke.ts` exists but isn't wired into `.github/workflows/agents-deploy.yml`); review-record completeness (`humanScore`/`whatWasWrong`) is enforced only at the `close-review.ts` CLI/schema level, with no Payload `beforeChange`/access hook blocking publish; no in-repo code receives a Slack-posted brief slug — only the manifest's chat-trigger declaration and the outbound report renderer exist | CNT04-02, CNT04-09, CNT04-13 |
| G8 | `checkExternalLinks` (the content-monitor invariant wrapper — URL aggregation and violation shaping) has no dedicated unit test; only its underlying `resolveExternalLink` primitive is tested, in a different package | CNT09-06 |
| G9 | `content-analyst` has no persisted or logged evidence of an executed deploy or smoke run — same gap as CNT04-02 | CNT10-02 |
| G10 | `content-planner` has the same unexecuted-deploy gap as G9; the `landscape` artifact has no producer, schema, or builder anywhere in the codebase, so synthesis is never exercised with reads+demand+landscape together; the `targetQuery` collision check (commission-time and weekly monitor) compares only against other briefs, never against the published corpus | CNT07-02, CNT07-04, CNT07-06 |
| G11 | Shadow-verdict pairing into review records (CNT11-S2/S3) is implemented and covered by fixture tests, but no live `.agency/content/reviews/*.yaml` files exist yet to demonstrate it against real CNT04-S3 output | CNT11-04 |
| G12 | Send attribution (`sendsForSlug`) is per-slug only — no function joins sends to content clusters, and `content-analyst`'s `read.ts` never imports or calls the distributor's `sends.ts` | CNT08-07 |

---

## 16. Linear sync

Load target: team `CON`.

| This file | Linear |
|---|---|
| Epic (`CNT01`) | Project — outcome becomes the description |
| Story (`CNT01-S2`) | Issue |
| Task (`CNT01-04`) | Sub-issue — Gherkin AC into the description |
| Phase | Project milestone or label `phase/now` |
| Kind of work | Label `work/build` or `work/content` |

**One team.** The Content vertical owns building its agents and producing content — see `product.md` §7. The `work/` labels are a balance check, not routing: if a month passes with no `work/content` item closed, the vertical has become a platform team.

| Epic | Label |
|---|---|
| CNT02-S1 (positioning, claim policy, rubric) · CNT02-10 (two pieces by hand) | `work/content` |
| Everything else | `work/build` |

**CNT02-S1 and CNT02-10 are the critical path.** They block CNT02, which blocks CNT03 and CNT04. Neither is code, both are the owner's to write, and nothing else in the Now phase can complete before them.

**IDs in this file stay canonical.** Linear's own `CON-142` is stored back as `linearRef` per item. Slug-shaped human-readable IDs survive a tracker migration; Linear's do not.

Before the first sync, every story and task needs two fields added:

```yaml
linearRef:        # empty until synced
syncedAt:
```

Without them the first re-import creates duplicates. This is the same discipline as `trackerRef` in the brief schema, and the same reason: one join key, written down, in both directions.
