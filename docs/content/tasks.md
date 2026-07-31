---
type: Tasks
practice: content
level: epic+story+task
version: '2.0'
owner: greg
status: Draft
last_updated: 2026-07-31
source: design.md
related:
  - ../README.md
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

---

## 1. Summary

**Total.** 123 points across 11 epics. **Now phase:** 55 points across 4 epics, in one team — `CON`.

**MVP is CNT01-S1** — the agent identity exists and can stage a draft over REST. Everything after it is a constraint on a capability that already works.

**Now critical path.** `{CNT01, CNT02} → CNT03 → CNT04`. CNT03 and CNT04 each depend on **both** CNT01 and CNT02 — those two start in parallel but neither is optional. 55 points if they run together (equal-sized at 13 pts each, different skill types — Payload engineering vs. hand-written standards); 68 points if one person carries both in sequence. CNT08 (Distribution) is Later and not on this path. CNT06 depends on nothing and fits any gap.

**Content-side gate.** Within CNT02, CNT02-S1 (standards) and CNT02-10 (two pieces by hand) block the rest of that epic — see §10 and `../product.md` §8.

---

## 2. Epics

| ID | Epic | Outcome | Phase | Pri | Pts | Depends | Status |
|---|---|---|---|---|---|---|---|
| **CNT01** | Publishing Guardrails | Nothing reaches readers without a human deciding it should | Now | P0 | 13 | — | Not started |
| **CNT02** | Content Contracts | Published claims are traceable to a source, and prohibited claims cannot ship | Now | P0 | 13 | — | Not started |
| **CNT03** | Content QA | The guarantees in CNT01 and CNT02 cannot be silently weakened | Now | P0 | 8 | CNT01, CNT02 | Not started |
| **CNT04** | Authoring Studio | A brief becomes a reviewable draft without a human writing the first version | Now | P1 | 21 | CNT01, CNT02 | Not started |
| **CNT09** | Corpus Invariants | The corpus stays true to itself without anyone remembering to check | Next | P1 | 8 | CNT02 | Not started |
| **CNT05** | Register Rules | The register's policy assertions are machine-checked rather than aspirational | Next | P1 | 8 | CNT03 | Not started |
| **CNT06** | Capture | An idea is never lost between having it and writing it | Next | P2 | 5 | — | Not started |
| **CNT10** | Intelligence Layer | Evidence about what is working exists, is auditable, and is not narrated noise | Later | P1 | 13 | CNT04, CNT09 | Not started |
| **CNT07** | Commissioning | What we write about is chosen from evidence rather than from whoever spoke last | Later | P2 | 13 | CNT10 | Not started |
| **CNT11** | Review Calibration | Review moves from human to agent on measured agreement, not on faith | Later | P2 | 8 | CNT04 | Not started |
| **CNT08** | Distribution | Published work reaches its audience without a human rewriting it per channel | Later | P3 | 13 | CNT01, CNT04 | Not started |

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

> **Working names.** Content collections are `posts` and `recipes` for this backlog. CNT01-01 starts by confirming against `src/collections/` (or creating them) and renaming later tasks if the site uses different slugs.

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

**Why the merge commit matters.** A gate that only runs pre-merge can be skipped by force-push or admin merge. The guarantee is worth having only if it cannot be routed around.

| Story | Description | Pts |
|---|---|---|
| CNT03-S1 | `.github/workflows/content-qa.yml` runs the gate suite on PR and merge commit | 3 |
| CNT03-S2 | Test asserting the agent role cannot set `_status` — the CNT01 guarantee, checked continuously | 3 |
| CNT03-S3 | PR comment output carrying gate status and the `couldNotVerify` list | 2 |

**Note.** The access-rule assertion here is deliberately narrow and specific. CNT05 generalises it into R9 in the register CLI once a second agent needs it. Shipping the specific test first is cheaper than shipping the mechanism.

---

## 6. CNT04 — Authoring Studio *(21 pts)*

**Scope.** The `content-studio` managed agent. Writer subagent first against hand-written briefs and packs, then the researcher. Slack-initiated, stages Payload drafts over REST, commits artifacts to `.agency/content/`.

| Story | Description | Pts |
|---|---|---|
| CNT04-S1 | Manifest and deployment — `claude-managed-agent`, `approval: pr-review`, `writes: [cms-draft, repo-branch, slack]` | 3 |
| CNT04-S2 | Writer subagent, six passes. **No `web_search`, `web_fetch` or `bash` in its tool list.** | 8 |
| CNT04-S3 | **Review record** — `editDistance`, `editLocus`, `humanScore`, `whatWasWrong`, `gateAttempts` captured at publish | 3 |
| CNT04-S4 | Researcher subagent — normalised pack, `sourceBudget` enforced, `couldNotVerify` populated | 5 |
| CNT04-S5 | Slack initiation and run reporting | 2 |

**CNT04-S3 is new and must ship with S2, not after it.** It is the only per-piece quality signal that arrives fast enough to act on, it costs ten seconds of human time per piece, and it cannot be backfilled. Every piece published without it is a lost observation.

---

## 7. Next and Later epics

| Epic | Stories | Pts |
|---|---|---|
| **CNT09** Corpus Invariants | Eight invariant checks (`design.md` §7); weekly workflow; push trigger on `packages/brand/**`; violations into Triage | 8 |
| **CNT05** Register Rules | R9 and R10 in the CLI; `$defs` for the `content:` block; R11 schema support | 8 |
| **CNT06** Capture | Idea → Triage from Slack; brief `expiresAt` sweep | 5 |
| **CNT10** Intelligence Layer | `content-analyst` manifest; `read` emission; n-threshold gate; cluster analysis; prediction logging | 13 |
| **CNT07** Commissioning | `content-planner`; synthesist over `read`+`demand`+`landscape`; brief generation; capped ready queue | 13 |
| **CNT11** Review Calibration | Shadow-verdict logging; per-class agreement rate; promotion/demotion automation (R12) | 8 |
| **CNT08** Distribution | `content-distributor`; per-surface adaptation; `approval: human` on every send | 13 |

---

## 8. Risks

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

## 9. Gaps

| # | Gap | Blocks |
|---|---|---|
| G1 | **No business strategy for Carinya Parc.** Epics cite workforce outcomes, not business outcomes. Subscribers toward what end is unwritten. | Prioritisation, not delivery |
| G2 | Subscriber target figures unset | CNT10 success criteria |
| G3 | Owners unassigned — manifests name `greg` as agent owner, no delivery owner | Every task carries `Owner: TBD` |

---

## 10. Linear sync

Load target: Linear team key `CON`. Epic IDs use the Content vertical prefix `CNT` from `product.md` §7 — team key and issue prefix are not the same string.

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

**CNT02-S1 and CNT02-10 are the content-side gate on the Now critical path** (`{CNT01, CNT02} → CNT03 → CNT04`). They block the rest of CNT02, which blocks CNT03 and CNT04. Neither is code, both are the owner's to write, and the rest of CNT02 cannot complete before them.

**IDs in this file stay canonical.** Linear's own `CON-142` is stored back as `linearRef` per item. Slug-shaped human-readable IDs survive a tracker migration; Linear's do not.

Before the first sync, every story and task needs two fields added:

```yaml
linearRef:        # empty until synced
syncedAt:
```

Without them the first re-import creates duplicates. This is the same discipline as `trackerRef` in the brief schema, and the same reason: one join key, written down, in both directions.
