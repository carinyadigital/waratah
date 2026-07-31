---
type: Product
scope: agent-workforce
version: '1.0'
owner: greg
status: Draft
last_updated: 2026-07-31
clock: quarterly
related:
  - README.md
  - architecture.md
  - content/design.md
  - content/tasks.md
  - packages/brand/src/positioning.md
---

# Carinya Parc — Agent Workforce

**What this is.** Why the agent workforce exists, what it is accountable for, what it is not allowed to do, and the order things get built. Reviewed quarterly.

**What this is not.** Not Carinya Parc's positioning — that lives in `packages/brand/src/positioning.md`, is human-only write, is hashed, and every published piece records the hash it was written under. If this document also described who Carinya Parc is for, there would be two sources and the hash guarantee would be decorative. This document describes what the *workforce* is for.

**Clock.** Quarterly. Kept separate from `architecture.md` deliberately: the register and policy rules churn weekly, and slow-moving constraints must not live in fast-moving files or nobody re-reads them.

---

## 1. The problem this solves

Carinya Parc is a 1–3 person operation with the surface area of a much larger one: a website, a content programme, an audience to build, enquiries to answer, search and answer-engine presence to earn, and regenerative land claims that carry regulatory exposure.

The binding constraint is not that work is slow. **It is that most of the work never happens at all.** Nobody opens GA4 weekly and cross-references it against Search Console. Nobody re-verifies whether a claim made in a post two years ago still has a live source. Nobody notices that three enquiries this month asked the same question no page answers.

That is the shape of the opportunity, and it dictates the shape of the answer.

## 2. What the workforce is for

Three claims, in priority order. Everything downstream should be traceable to one of them.

**2.1 Do the work that otherwise doesn't happen.** Continuous analysis, corpus maintenance, invariant checking, evidence gathering. This is where agents beat a small team outright, because the alternative isn't a slower human — it's nothing.

**2.2 Raise the floor, not the ceiling.** Every piece meets the standard: sourced, on-voice, structurally sound, internally linked, free of prohibited claims. The best work will still be human. The point is that nothing published is careless.

**2.3 Make quality enforceable rather than asserted.** Standards as versioned files, claims traceable to sources, publishing denied in code rather than by instruction. A guarantee that depends on an agent following a prompt is not a guarantee.

**What it is explicitly not for: volume.** Publishing rate is pinned to human review capacity, permanently. The throughput advantage is spent on drafts rejected, not posts shipped. See §5.

## 3. Outcomes

One primary metric per practice, each with a paired guardrail. The guardrail is not optional: any metric handed to an agentic loop without a counter-metric becomes a machine that optimises exactly what you asked for.

| Practice | Primary | Guardrail | Status |
|---|---|---|---|
| **Content** | Net new email subscribers | 30-day engaged open rate · unsubscribe rate | Active |
| **Engineering** | Merged PRs requiring no human code change | Change failure rate · open invariant violations | Planned |
| **Support** | Enquiries answered within one business day | Escalation rate · human correction rate | Planned (`support-triage` not yet in this register) |

**Why subscribers for content.** Leading rather than lagging, moves weekly, and critically **not bought by volume** — publishing thin pieces pushes subscribers-per-reader down. The metric argues against the failure mode this whole design exists to prevent. Enquiries were the alternative and are too slow and too low-volume to steer by.

> `[NEEDS CLARIFICATION]` No target figures. "Net new subscribers" is the right metric; what counts as success in 12 months is unwritten, and no epic can currently cite a number.

### 3.1 The gap this document does not close

The epics in `content/tasks.md` are required to name a product outcome. They can now cite *workforce* outcomes — the table above. They still cannot cite a **business** outcome, because there is no strategy document for Carinya Parc itself. Subscribers toward what end is unwritten.

This is a real gap and it is named here rather than papered over. It does not block the Now phase, because the Now-phase epics are capability guarantees whose value doesn't depend on the answer. It will block prioritisation the moment there is more work than capacity.

## 4. What we refuse to automate

Classified by **reversibility and blast radius**, not by difficulty. These do not graduate with better models.

- **Anything irreversible.** A send, a spend, a publish that cannot be quietly withdrawn.
- **Anything with regulatory exposure.** ACCC guidance on environmental and sustainability claims is live and applies directly to regenerative land claims. `mustNotClaim` asserts; it does not protect.
- **Anything that commits us to a public position.**
- **Any change to the standards layer.** Positioning, voice, claim policy, editorial rubric. An agent may propose a diff with evidence; a human merges it. If the reviewer can edit the rubric, there is no rubric.
- **Definitional decisions.** What we are for, what we refuse to do. Not estimable, not delegable.

## 5. Operating principles

**The manifest is written before the agent.** Security posture is a deliberate design decision reviewed in a diff, not an emergent property of implementation.

**Humans own the irreversible.** The design target is that the worst case of any agent failure is a draft somebody declines.

**Standards are versioned artifacts, not instructions.** Hashed, human-only write, referenced by every agent, never duplicated.

**The register answers one question: what acts on our behalf, and what may it touch?** If an agent isn't in the register, it doesn't exist.

**Publishing rate is pinned to human review capacity.** If one person can properly edit one piece a week, the system publishes one piece a week. This is a policy field, not an intention.

**Prefer the check to the instruction.** Every time a human reviewer catches something, ask whether it could have been a check. The gate suite grows monotonically from human catches — and that growth is the mechanism by which review eventually graduates from human to agent.

**If the manual version isn't yet annoying, the agent is overhead with a manifest.** Applied to every proposed agent, including ones already specified.

## 6. Cost envelope

> `[NEEDS CLARIFICATION]` Prior working estimate was $200–700/month across the workforce. Not re-derived here and not yet a budget.

Spend caps are declared per agent in the manifest (`policy.spendCapUsd`) and required for any agent with a schedule trigger — see R5 in `architecture.md`. Analytical agents carry deliberately higher caps than production agents: strong models and long runs are affordable precisely because their envelope contains nothing irreversible.

## 7. Verticals

A vertical owns an outcome end to end: **the agents it needs, and the work those agents do.** It maps to one Linear team.

| Vertical | Owns | Prefix | Status |
|---|---|---|---|
| **Content** | The content loop — building it and running it. The corpus and its invariants. | `CNT` | Active |
| Engineering | The Next.js app | `ENG` | Not yet |
| Support | Inbound enquiry triage | `SUP` | Planned — `support-triage` not yet in the register |

**One vertical today, and it owns both halves.** No platform team builds agents for someone else to use. The people who know what the loop needs are the ones building it, which avoids the usual failure of a thing built to spec rather than to purpose.

### 7.1 Build and run are one board, two labels

Almost all work today is *building the loop*; almost all work in six months is *running it*. That is a phase change within one team, not two teams working in parallel.

- `work/build` — schemas, gates, manifests, access rules, workflows
- `work/content` — positioning, claim policy, briefs, drafts, editorial review

**The labels exist as a balance check, not for routing.** Building has clear completion criteria; publishing has a blank page, so a vertical owning both will drift toward the build. One question at each review: *what did we publish this month?* If the answer is "nothing, but the gates are nearly done" twice running, the vertical has quietly become a platform team.

### 7.2 What is not a vertical

**SEO and AEO.** They are a source of work landing inside verticals — technical findings into engineering work, opportunity findings into the discovery track. An analyst agent files into both.

**Site sections.** Blog, recipes, landing pages are labels: one repo, one deploy, one review gate, nothing to separate.

### 7.3 What gets centralised later

Agent primitives and common personas — a software-engineer persona, shared subagent patterns, reusable evaluation harnesses — belong in a shared layer once a second vertical needs the same thing. **The doc set already anticipates this:** `architecture.md` is the shared layer (manifest spec, policy rules, CLI, connections); `content/` is the vertical. A second vertical sits alongside as `engineering/` drawing on the same architecture, and centralising personas needs a `packages/agent-primitives/` plus a section in `architecture.md` — not a restructure.

**Do not centralise before the second consumer exists.** A primitive extracted from one use is a guess.

## 8. Build sequence

**Ordered by feedback speed, not by value.** A gate tells you it's wrong in one second, a writer in ten minutes, an analyst in sixty days, a commissioner in a quarter. Fast-feedback components are where you learn whether the design is right, and each one constrains the slow components downstream.

This deliberately inverts "most valuable first." The intelligence layer is the most valuable part of the content practice and is built sixth, because until there is a corpus and a review record it has nothing to be right about.

| Phase | What | Label |
|---|---|---|
| **Now, first** | Positioning, claim policy, editorial rubric, two pieces written by hand | `work/content` |
| **Now** | Publishing guardrails, contracts and gates, QA, authoring studio | `work/build` |
| **Next** | Corpus invariants, register rule generalisation, capture | `work/build` |
| **Later** | Intelligence layer, commissioning, calibration, distribution | `work/build` |
| **Not yet** | Paid, an engineering vertical | — |

**Now critical path:** `{CNT01, CNT02} → CNT03 → CNT04`. CNT01 (Payload guardrails) and CNT02 (contracts) start in parallel; both are required before CNT03 and CNT04. Distribution (CNT08) is Later, not on this path — see `content/tasks.md` §1.

**The content-side gate does not start with code.** The gates cannot be built before the standards they check exist, so three short documents and two hand-written posts (CNT02-S1, CNT02-10) block the rest of CNT02, which blocks CNT03 and CNT04. Those items are `work/content`, they are the owner's to write rather than to build, and they are the first real test of §7.1.

An engineering vertical stays out of scope despite being the more mature agentic domain: the review layer there is a commodity worth buying rather than building, and the site is not the constraint on the business today.

## 9. Known limits

- **No business strategy document.** §3.1. The largest gap.
- **No cross-vertical sequencing surface.** Dropping `.agency/backlog.md` in favour of per-vertical `tasks.md` is correct while there is one vertical. **Revisit trigger: the second vertical ships.** At that point either accept per-vertical independence or reintroduce a roll-up.
- **Agent primitives are not centralised.** Deliberate — a primitive extracted from one use is a guess. **Revisit trigger: a second vertical needs the same persona or subagent pattern.** Then extract to `packages/agent-primitives/` and document it in `architecture.md` §4.
- **Full vertical ownership will drift toward the build.** §7.1 names the mechanism and the check. It is a real risk, and the label balance is a monitor rather than a control — nothing stops the drift except noticing it.
- **The `content:` manifest block, and rules R11–R12 that depend on it, are documentation until the schema and CLI implement them.** R7–R10 are enforced as stated in `architecture.md` §6.
- **Two of the four content quality questions are underpowered for years.** "Did anyone read it" and "what resonated" stay noisy at this volume. Designed for accordingly.
- **Agent review is aspirational.** The graduation ladder in `content/design.md` §9 has a real mechanism, but no decision class has a calibration record yet. Everything currently sits at level 0 or 4 — human, or deterministic. Nothing is in between.
