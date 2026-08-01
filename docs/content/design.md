---
type: Design
practice: content
version: '3.0'
owner: jonno
status: Draft
last_updated: 2026-07-31
related:
  - ../product.md
  - ../architecture.md
  - ../decisions/ADR-0001-content-storage.md
  - ../decisions/ADR-0002-managed-agents.md
  - ../decisions/ADR-0003-no-direct-database-access.md
  - tasks.md
---

# Content Agents — Design

**Scope.** The whole content loop: how work is chosen, how it is made, how it is checked, how it is published, how the corpus is kept true, and how review moves from human to agent over time. The one home for this design — nothing overlapping lives elsewhere.

---

## 0. Findings this rests on

### 0.1 The executor is not the hard part

At one piece a week the writer saves an hour. The analyst does work that **otherwise never happens at all** — nobody opens GA4 weekly, cross-references it against Search Console and Ahrefs, checks which pages are decaying, and notices three enquiries asked the same unanswered question.

Track one is where the value is. It needs strong models and wide read-only tool access, and it is cheap to run safely: it reads everything and writes an artifact, a tracker row, and a Slack message. Nothing irreversible in the envelope.

### 0.2 An analysis is expensive to check; a draft is cheap

A human reads a draft and knows. If you could quickly check whether the read of GA4 was right, you wouldn't have delegated it. And **a stronger model makes a wrong analysis more persuasive, not less likely.**

Two failure modes needing mechanical defences rather than instructions:

- **Narrating noise.** Most week-over-week movement here is nothing. An LLM asked "what changed and why" always answers, because answering is what it does.
- **Post-hoc story fitting.** Given an outcome and a pile of data it finds a cause. Reliably. Whether or not one exists.

### 0.3 The feedback loop cannot be the quality control

The brief carries `successMetric: how we'll know in 90 days`. Honest, and the problem: performance data arrives a quarter late, n of one per period, against a baseline that also moved.

> Quality control happens **before** publish, from deterministic gates and one human's judgement. The feedback loop improves **selection** — what was worth writing at all. Conflating them is this design's most likely failure.

### 0.4 Four clocks

| Loop | Clock | Question | Fusing it wrong gives you |
|---|---|---|---|
| **Standards** | Quarterly | Who are we for, what do we claim? | Drift nobody decided on |
| **Intelligence** | Weekly | What is actually happening? | Stale evidence |
| **Commissioning** | Monthly | What next, in what order? | Thrash, or an unholdable queue |
| **Production** | Per piece | Make the thing | — |

---

## 1. The standards layer

Above both tracks. Every agent reads it; **no agent writes it.**

```
packages/brand/
├── src/
│   ├── positioning.md        # who we're for, what we claim, where we compete
│   ├── voice.md
│   ├── surfaces/             # blog · recipes · landing · newsletter · linkedin · instagram
│   ├── banned-words.json
│   ├── claim-policy.md       # what we never assert without a primary source
│   └── editorial-rubric.md   # what pass 3 edits against
├── dist/                     # generated. never hand-edited
└── build.ts
```

An agent may propose a diff with evidence; a human merges it. **If the reviewer can edit the rubric, there is no rubric** — and this is the mechanism by which a brand quietly becomes whatever the agents have been doing.

`positioning.md` carries a hash. Every published piece records the hash it was written under, which turns "this page predates our current positioning" into a check (§7) rather than a discovery.

Referenced by `dist/` path, never duplicated into an agent — R8.

**The quarterly review asks one question: is what this has become what we wanted?** Nothing else in the system can ask it, because everything else is downstream of the answer.

---

## 2. Two tracks

**Track one — deciding what to write.** Scheduled, evidence-driven, proposes. Never touches the CMS.

**Track two — writing it.** Human-initiated, brief-driven, produces. Never decides what to write.

The split exists because the failure modes are opposite: track one fails by proposing work nobody needed, track two by producing work badly. Fusing them means an agent that commissions its own work and grades its own homework.

### 2.1 Track one: intelligence and commissioning

Two deployments on two clocks, not one.

| Role | Sits in | Consumes | Emits |
|---|---|---|---|
| **Performance analyst** | `content-analyst` | GA4, Search Console, Ahrefs, ESP | `read` |
| **Audience researcher** | `content-analyst` | Enquiry themes from `support-triage`, comments, replies, on-site search, SERP intent | `demand` |
| **Market researcher** | `content-desk` | Competitors, category, regulation | `landscape` (quarterly, human-driven) |
| **Synthesist** | `content-planner` | `read` + `demand` + `landscape` + positioning | `opportunities` |
| **Commissioner** | `content-planner` | One opportunity + positioning | `brief` |

One level deep throughout — lead plus specialists, no nesting. Market research stays on the desk: quarterly, judgement-heavy, doesn't earn a manifest yet.

### 2.2 Track two: the studio

Human-initiated from Slack against a specific brief. Two subagents:

**Researcher.** Gathers evidence, returns a structured `pack`. Not raw page text — normalisation is a filter, and the pack schema is validated on write.

**Writer.** Reads the pack, not the internet. Its tool list is empty of `web_search`, `web_fetch`, and `bash`. Six passes: 0 structure, 1 draft, 2 claim-anchoring, 3 rubric edit, 4 internal links, 5 gates.

Four containment properties, and the fourth is the only one that isn't an instruction:

1. The researcher normalises; source text never reaches the writer raw
2. The writer has no web access
3. Source text is data, never instructions — stated in both subagents
4. **The agent's Payload role cannot publish.** Not by instruction — by access control, in code. §6.

> Shrink the capability surface until the worst case is a draft.

---

## 3. The metric

| | |
|---|---|
| **Primary** | Net new email subscribers |
| **Per-piece** | Subscribers ÷ unique readers, **by cluster** |
| **Guardrails** | 30-day engaged open rate · unsubscribe rate |

**Why subscribers.** Leading, moves weekly, and **not bought by volume** — thin pieces push subscribers-per-reader down, so the metric argues against the failure mode this design exists to prevent.

**Why the guardrails aren't optional.** Subscribers is trivially gamed by an aggressive interstitial and a weak lead magnet: a dead list and a rising number. Any metric handed to an agentic loop needs a counter-metric that is also checked.

### 3.1 What each quality question is answerable by

| Question | By | When | Honest limit |
|---|---|---|---|
| **Was it on point?** | Gates + brief conformance | Pre-publish | Solved. Checks claims have sources, not that sources are right. |
| **Was it good?** | A human, in ten seconds | At merge | No machine substitute today |
| **Did anyone read it?** | GSC + analytics | 30–90 days | n=1 per period. Large effects only. |
| **What resonated?** | Citations, links, replies, enquiries | 30–180 days | Qualitative. Attribution at this volume is storytelling. |

Only the first is an engineering problem. The second is a staffing decision. The third and fourth are underpowered for years and the design assumes they stay that way.

---

## 4. Contracts

Three schemas in `packages/content-pipeline/`. Artifacts in `.agency/content/`, slug as join key across tracker, artifacts, and CMS document.

### 4.1 `brief.schema.json`

```yaml
slug:                    # join key. canonical.
trackerRef:              # Linear issue ID
surface:                 # blog | recipes | landing | newsletter
targetQuery:             # exactly one. see §7 invariants
angle:
audience:
mustSupport: []          # claims the piece must make and evidence
mustNotClaim: []         # prohibited. checked by gate.
internalLinks: []
sourceBudget:            # max pack entries. caps researcher runtime.
successMetric:           # how we'll know in 90 days
positioningHash:
expiresAt:               # 90 days. an unstarted brief is a stale opinion.
```

### 4.2 `pack.schema.json`

```yaml
slug:
entries:
  - claim:
    source:              # URL
    excerpt:             # short
    confidence: high | medium | low
    verifiedAt:
    mustSupport: true|false
couldNotVerify: []       # ← required. may not be empty by omission.
```

### 4.3 `read.schema.json`

The analyst's equivalent of the pack — makes output auditable rather than merely fluent.

```yaml
period:
positioningHash:
questions: []            # ← pre-registered. asked BEFORE looking.
findings:
  - finding:
    figures:
      - value:
        query:           # exact GA4/GSC/Ahrefs query, re-runnable
        n:               # sample size. always.
        window:
    cluster:             # topic-area | angle-type | format | funnel-intent
    confidence: high | medium | low
    exploratory:         # not pre-registered → no recommendation alone
    alternativeExplanations: []   # ← required
couldNotDetermine: []             # ← required
recommendations:
  - action: write | update | consolidate | redirect | delete | leave-alone
    rationale:
    prediction: {claim:, baseline:, horizon:, confidence:, ifWrong:}
```

Three fields carry the weight:

**`query` per figure.** Every number traces to something re-runnable. Same audit property as claim coverage — doesn't make the interpretation right, makes the arithmetic checkable, and a surprising share of analyst error lives there.

**Pre-registered `questions`.** "Find insights in GA4" is a story generator. "Did recipe-page subscriber conversion change after the CTA move?" is analysis.

**`alternativeExplanations` non-empty.** An analyst that never offers a rival explanation isn't being careful, it's being confident.

### 4.4 Two analyst disciplines

**The n-threshold gate.** Deterministic, declared per source as `content.nThreshold`, and the only mechanical defence against noise-narration:

> Below the declared n, the analyst may report a figure but may not assert a direction.

**Cluster, never piece.** A post might convert 2 subscribers or 5. That difference is nothing and an agent will narrate it. Per-piece conversion is anecdote until several pieces of a kind accumulate.

### 4.5 Recommendations carry predictions

Logged, scored at horizon whether or not anyone is still interested. Over a year this is a calibration record, and **that record — not report quality, not output volume — is the measure of whether the analyst is worth its tokens.**

Two disciplines stop this becoming a work generator:

- **The action vocabulary is symmetric.** `consolidate`, `redirect`, `delete`, `leave-alone` are first-class. An analyst that can only ever add can't be trusted to say when to stop.
- **"Recommend nothing" is valid, expected, and tracked.** If it proposes work every period, it isn't analysing — it's justifying.

---

## 5. Gates

`packages/content-pipeline/`, run by `content-qa` in GitHub Actions on the artifacts PR, and re-run on the merge commit where they can't be skipped. No model calls.

| Gate | Checks |
|---|---|
| **Claim coverage** | Every annotated claim resolves to a pack entry; every `mustSupport` appears | 
| **Prohibition** | Nothing matches `mustNotClaim` or a `claim-policy.md` pattern |
| **Style lint** | `banned-words.json` + per-surface rules |
| **Links** | External resolve; `internalLinks` present |
| **Structure** | Payload document validates against generated types |
| **Readability** | Band per surface |
| **Brief conformance** | Slug has a brief; `trackerRef` resolves; `positioningHash` recorded |

### 5.1 Making claim coverage deterministic

Claim coverage is the gate that matters, and as usually specified it can't be built: **extracting claims from prose is a model job**, so a gate that has to do it isn't deterministic and can't be trusted in CI.

Annotation is the way out. Under Payload this is a **Lexical inline feature** — a custom node carrying a `claimId`:

```json
{ "type": "claim", "claimId": "c3",
  "children": [{ "type": "text", "text": "roughly 0.4% over four years" }] }
```

The gate walks the editor JSON and checks, as pure structural work:

1. Every `claimId` resolves to an entry in `.agency/content/packs/<slug>.yaml`
2. Every pack entry flagged `mustSupport` appears in the document
3. No annotated claim matches `mustNotClaim` or a `claim-policy.md` pattern

**Honest cost.** The writer must annotate, a human editor must not silently delete annotations while editing, and this depends on Payload's Lexical feature API. Under repo-native MDX this would have been a one-line regex. It is the real price of ADR-0001, and it is worth paying for what §6 buys.

> **The gate suite grows monotonically from human catches.** Every time the editor catches something, ask whether it could have been a check. That growth is the mechanism by which review graduates (§9).

---

## 6. Publishing with Payload

Payload is the reason this design's central guarantee is enforceable rather than aspirational. See ADR-0001.

### 6.1 The agent is a Payload user

A user in the `users` collection with `useAPIKey: true` and a role of `agent`. Two things follow free: **provenance** (version history attributes every staged draft to that identity, no marker field to maintain) and **revocation** (rotating one key stops the agent, touching nothing else).

### 6.2 The publish denial, in code

`versions: { drafts: true }` on content collections injects `_status`. The collection's `update` access returns a **query constraint** on `_status` for the agent role: the agent can write drafts and cannot promote them. Payload's Admin UI hides Publish and Unpublish for any user whose constraint prevents publishing, so the rule is visible in the interface as well as enforced at the API.

Field-level access denies the agent `update` on `title`, `slug`, and anything else it has no business touching. **Note the asymmetry:** collection-level access can return a query constraint; field-level access returns only a boolean. The publish block belongs at collection level, field locks at field level.

**This is the only place a manifest assertion becomes verifiable.** `writes: [cms-draft]` corresponds to a named role whose access rules are a file in the repo, so CI can assert the rule still exists — R9.

### 6.3 The trap worth writing down

**Payload's Local API skips access control by default.** Correct behaviour for server-side code that needs full control; a loaded gun pointed at this design. A direct database credential is the same problem one layer lower. Hence R10 and ADR-0003.

Where a narrow Local API endpoint is genuinely needed, write it as a specific route with its own access check — never as a general capability granted to an agent.

---

## 7. Invariants — `content-monitor`

> The corpus is a system with invariants, not a series of deliverables.

Weekly, no model calls, files violations into Triage. **Work is generated by drift, not by a planning meeting.**

| Invariant | Check |
|---|---|
| Every published document has a brief and a pack | Slug join across CMS and `.agency/content/` |
| Every regulated claim's source is < 12 months old | `verifiedAt` vs `claim-policy.md` categories |
| Every target query has exactly one canonical page | `targetQuery` uniqueness across briefs |
| Every page has ≥ 1 internal link in | Site graph reachability |
| No page predates the current positioning hash | Hash compare |
| No page unreviewed past its decay half-life | Per-surface date field |
| Every `mustSupport` claim still resolves | Pack ↔ Lexical annotation re-check |
| Every external link still resolves | HTTP |

Six of eight are pure structural work. The value is that **nobody ever re-verifies a two-year-old page** — the thing an agent can do and a human agency structurally cannot, because nobody will pay for it.

When positioning changes, this tells you which twelve pages now contradict it. That is why the trigger includes a push to `packages/brand/**`.

---

## 8. Instrumentation — the review record

Per piece, at merge. Ten seconds of human time, and the only per-piece quality signal arriving fast enough to act on.

```yaml
# .agency/content/reviews/<slug>.yaml
slug:
editDistance:        # fraction of the staged draft surviving to publish
editLocus: []        # which sections took the rewriting
humanScore:          # 1–5
whatWasWrong:        # free text
gateAttempts:        # passes before all gates green
publishedAt:
positioningHash:
```

The diff between what the studio staged and what the human published is produced free by every piece, and it is diagnostic in a way analytics never will be:

- **Structure survives, sentences rewritten** → voice problem. Fix the rubric or `voice.md`.
- **Prose survives, argument reordered** → brief problem. Fix the brief schema or the commissioner.
- **Gate attempts high, edit distance low** → the gates are wrong, not the writer.

This is the input to the improvement loop. Not analytics. When `editDistance` stops falling, the standards layer needs a diff, and `editLocus` says which part.

---

## 9. Review graduation

The goal is agent review. Why it works in engineering and not here by default, stated precisely, because it points at what to build:

**In engineering the LLM reviewer isn't the oracle — tests, types, and the compiler are.** The model proposes hypotheses to a cheap ground-truth check. Content has no compiler for "is this true, is this us, is this worth publishing." Verification costs as much as generation, ground truth arrives months late and confounded, failures are public.

So the path is not a better judge model. **It is manufacturing the oracle.** Four mechanisms, descending reliability:

1. **Convert judgement into checks.** §5.1. Highest return, and where most quality complaints decompose to once you try.
2. **Adversarial review, not approval review.** An agent asked "is this good?" says yes. An agent asked *"identify the three weakest claims, the strongest counter-argument, and the one sentence a hostile reader would quote"* produces something useful. **Prosecutors, not judges** — output is a list of challenges; something else disposes of them. The reviewer must not see the producer's reasoning or it inherits its errors: different context, different prompt, ideally different model.
3. **Calibration against human decisions.** Log the human verdict and the agent's shadow verdict on the same item. Agreement rate per class over a rolling window is the only legitimate basis for promotion.
4. **Prediction scoring.** §4.5. Where there's no near-term oracle, the market is the oracle, delayed.

### 9.1 The ladder

Per decision class, never wholesale. Each climbs independently.

| Level | Mechanism |
|---|---|
| **0** | Human decides. Agent doesn't participate. |
| **1** | Agent emits a shadow verdict; human decides without seeing it. Agreement logged. |
| **2** | Agent decides; human reviews 100%, agent's verdict is the default. |
| **3** | Agent decides; human audits a sample. Reversals logged. |
| **4** | Agent decides; human sees only escalations. |

**Promotion:** agreement above threshold across a meaningful sample *of that class*, zero severe misses. **Demotion:** one severe miss drops the class two levels. Both automatic, both logged. Enforced as R12.

### 9.2 Starting positions

| Decision class | Start | Realistic ceiling |
|---|---|---|
| Structural / schema conformance | 4 | — |
| Link and prohibition checks | 4 | — |
| Claim traceability | 4 | — |
| Figure re-derivation in a `read` | 1 | 3–4 |
| Draft quality | 0 | 2, slowly |
| What to commission | 0 | 1–2 at best |
| Publish, send, spend | 0 | never |

Craft judgement stalling at 2–3 is the correct outcome, not a failure.

### 9.3 What never graduates

Classified by reversibility and blast radius, not difficulty. See `product.md` §4.

---

## 10. The roster

Seven agents. `product.md` warns against being wrong about too many, so each earns its place:

| Agent | Track | Platform | Approval | Exists separately because |
|---|---|---|---|---|
| `content-analyst` | One | `claude-managed-agent` | `draft-only` | Weekly clock, read-only, analytics credentials |
| `content-planner` | One | `claude-managed-agent` | `draft-only` | Monthly clock. Synthesis and commissioning. No CMS, no repo. |
| `content-studio` | Two | `claude-managed-agent` | `pr-review` | Human-initiated. `cms-draft` + `repo-branch`. Cannot publish. |
| `content-qa` | — | `github-actions` | `none` | Deterministic gates. No model calls. |
| `content-monitor` | — | `github-actions` | `none` | Weekly invariants. No model calls. |
| `content-distributor` | — | `claude-managed-agent` | `human` | The only agent that can reach an audience |
| `content-desk` | — | `claude-subagent` | — | Interactive surface. Quarterly market research and positioning review. |

### 10.1 `content-analyst`

```yaml
version: 1
name: content-analyst
owner: jonno
description: Track one intelligence. Reads performance and audience signals, emits a read artifact. No CMS, no repo, no send.
tags: [content, intelligence]

deploy:
  platform: claude-managed-agent
  schedule: "0 7 * * MON"
  timezone: Australia/Sydney

triggers:
  - type: schedule
  - type: chat
    channel: slack

policy:
  untrustedInput: true
  connections: [ga4, gsc, ahrefs, esp, slack]
  writes: [artifact-store, tracker, slack]
  approval: draft-only
  spendCapUsd: 60          # deliberately high: strong model, long runs, read-only envelope
  idempotencyKey: read.period

content:
  voice: packages/brand/dist/carinya-voice.json
  rubric: packages/brand/dist/editorial-rubric.md
  positioning: packages/brand/dist/positioning.json
  nThreshold: {ga4: 400, gsc: 200, esp: 150}     # R11
  clusters: [topic-area, angle-type, format, funnel-intent]

observability:
  traces: both
  alertChannel: "#carinya-content"
  evals: agents/content-analyst/evals
```

No `payload`, no `repo-branch`, no send. The strong model and wide tool access are affordable **precisely because** the envelope contains nothing irreversible: worst case is a confidently wrong artifact a human declines.

### 10.2 `content-monitor`

```yaml
version: 1
name: content-monitor
owner: jonno
description: Weekly corpus invariant check. Files violations to tracker. No model calls.
tags: [content, ci]

deploy:
  platform: github-actions
  workflow: .github/workflows/content-monitor.yml
  harness: none

triggers:
  - type: schedule
    cron: "0 5 * * SUN"
    timezone: Australia/Sydney
  - type: repo-event
    event: push
    paths: ["packages/brand/**"]      # positioning change → immediate re-check

policy:
  untrustedInput: false
  connections: [github, payload]
  writes: [tracker, pr-comment]
  approval: none
  idempotencyKey: invariant.id+page

observability:
  traces: none
  alertChannel: "#carinya-content"
```

---

## 11. Build order

**Ordered by feedback speed, not value.** A gate tells you it's wrong in one second, the writer in ten minutes, the analyst in sixty days, the commissioner in a quarter. Fast-feedback pieces are where you learn whether the design is right, and each constrains the slow ones downstream.

This inverts "most valuable first" deliberately. The analyst is the most valuable component and is built sixth, because until there is a corpus and a review record it has nothing to be right about.

| # | Epic | Build |
|---|---|---|
| 1 | CNT01 | Payload guardrails — the agent identity that cannot publish |
| 2 | CNT02 | Standards, schemas, gates. **Two pieces written by hand.** |
| 3 | CNT03 | `content-qa` — gates in CI plus the access-rule assertion |
| 4 | CNT04 | `content-studio` — writer first, then researcher. Review record from day one. |
| 5 | CNT09 | `content-monitor` — corpus invariants |
| 6 | CNT05 | R9/R10 generalised into the register CLI |
| 7 | CNT06 | Capture — ideas reach the queue |
| 8 | CNT10 | `content-analyst` — the intelligence layer |
| 9 | CNT07 | `content-planner` — synthesis and commissioning |
| 10 | CNT11 | Review calibration ledger |
| 11 | CNT08 | `content-distributor` |

**Weeks 1–4 (CNT01–CNT03) are non-negotiable; everything after is optional and independently useful.** Standards, schemas, real gates, and one human writing one piece a week is already a better operation than most agencies, and it's the foundation everything else plugs into without rework.

### 11.1 The volume cap, as policy

> Publishing rate is pinned to human review capacity, permanently — not to what the agents can produce.

The throughput advantage is spent on **drafts rejected**, not posts shipped. Cheap exploration, expensive publication.

There is a business argument as well as a defensive one. What earns citations in answer engines and durable rankings is being the canonical source on a narrow set of topics — a depth game. Twenty adequate posts lose to one everyone quotes, and the twenty actively cost you: thin pages dilute topical signal and become exactly what `content-monitor` flags for refresh later. You would be paying agents to create work for agents.

---

## 12. Limits

- **Claim coverage checks completeness, not truth.** Catches a claim with no source. Not a claim with a bad source, a misread source, or a source saying the opposite.
- **Style lint catches banned words, not bad writing.** Everything that makes prose good is outside the gate.
- **`mustNotClaim` asserts, it doesn't protect.** Not legal review. ACCC exposure on environmental claims still needs a human who knows the rules.
- **The analyst can be confidently wrong and nothing downstream catches it.** The design's largest unmitigated risk. The n-threshold gate, pre-registered questions, required alternatives and scored predictions all reduce it; none eliminates it. A well-written wrong analysis is more dangerous than a bad draft because it changes what gets written for a quarter.
- **Calibration is not accuracy.** You will get calibrated — reliably knowing how uncertain you are — long before accurate. A real win; don't mistake one for the other.
- **Content evals remain the weakest part.** No unit test for "is this any good." Workable approximation: a small golden set, rubric-scored pairwise comparison on every change to voice or instructions, and honesty that it measures consistency rather than quality.
- **The commissioner is the highest-leverage decision with the least ground truth.** Its errors are invisible — you never see the piece you chose not to commission. Everything downstream can be excellent while the system points somewhere pointless. Keep a human here longest and keep the queue capped.
- **Two of the four quality questions are underpowered for years.** Designed for accordingly.
- **The distributor may still be premature.** At a few pieces a month a human adapts them in fifteen minutes with no credentials, approval gate, or spend cap. **The same test applies to every agent above: if the manual version isn't yet annoying, the agent is overhead with a manifest.**

---

## Reference

- [Payload access control](https://payloadcms.com/docs/access-control/overview) · [drafts](https://payloadcms.com/docs/versions/drafts) — the publish denial and the Local API caveat
- [payloadcms/skills](https://github.com/payloadcms/skills)
- [Claude Managed Agents — scheduled deployments](https://platform.claude.com/docs/en/managed-agents/scheduled-deployments)
- [carinyaparc/digital-agency-plugins](https://github.com/carinyaparc/digital-agency-plugins) — practice plugins, personas, cookbooks
- [marketing-team-eve-template](https://github.com/vercel-labs/marketing-team-eve-template) — lead-plus-specialists, tool allow-lists, evidence boundaries
- [Sanity + eve docs-feedback agent](https://vercel.com/kb/guide/sanity-eve-agent) — stage-never-publish, idempotency, capability shrinking
