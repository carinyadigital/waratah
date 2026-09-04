# `product-discovery` — team design for review

**Status:** draft, for JD review. Nothing built.
**Date:** 03/08/2026
**Companion to:** `product-delivery.md` (the other track), `content-marketing-team.md` (establishes the conventions this follows).

One deployable team. `product-manager` is the lead and the only agent with a schedule. Its
subagents hold no clock — they are spawned at runtime, in their own isolated threads, when
the lead needs something it does not have.

**Target outcome: Definition of Ready.** Discovery takes an opportunity and produces a piece
of work that a delivery team can pick up without asking a question. It does not build
anything.

This is the discovery track of dual-track agile, and it is not an engineering activity. The
lead is a product manager because the decision being made is *should we build this, and what
exactly*. Engineering is one voice in that, not the chair.

---

## 1. The four risks

Every subagent on this roster exists to retire one of the four product risks. This is the
structure of the team, not a metaphor.

| Risk | Question | Owned by |
|---|---|---|
| **Value** | will anyone want this | `user-researcher`, `product-analyst` |
| **Usability** | can they work out how to use it | `product-designer` |
| **Feasibility** | can we build it, and what does it touch | `tech-lead` |
| **Viability** | does it work for the business | `product-manager` (lead), `commercial-reviewer` |

A ticket reaches Ready when all four are retired or explicitly accepted as open. The
`readiness` verdict names which.

---

## 2. Shape

```
agents/product-discovery/
  agent.yaml            lead identity, model tier, roster, permissions
  instructions.md       how the desk is run
  connectors/           linear only
  schedules/            one loop
  subagents/
    user-researcher/      value — qualitative
    product-analyst/      value — quantitative
    product-designer/     usability
    tech-lead/            feasibility
    business-analyst/     requirements, rules, edge cases
    qa-analyst/           test scenarios, challenges the AC
    commercial-reviewer/  viability (deferred, §8)
  dist/
```

The lead runs a desk. It frames the problem, chooses which options to pursue, and decides
whether the work is ready. It does not research, design, estimate, or write acceptance
criteria. What makes the others subagents is that none of them chooses the work or ships it.

**This team is not engineering-only in what it feeds, either.** Ready work routes to whichever
delivery team owns it — `product-delivery` for software, `content-marketer` for content. The
routing field on the ticket decides. See decision 6.

---

## 3. The loop

Five phases. The lead runs one phase per invocation and advances on the ticket status.

```
lead polls Linear: status=Opportunity, ordered by priority
      │
─── 1. FRAME ────────────────────────────────────────────────
      lead reads the opportunity, states problem, target outcome,
      and which of the four risks are actually unknown
      │
─── 2. EVIDENCE ─────────────────────────────────────────────
      ├─ user-researcher    ──┐
      ├─ product-analyst    ──┤  parallel, genuinely independent
      └─ tech-lead (scan)   ──┘  the textbook parallelisation case
                  │
            lead synthesises; may kill the opportunity here
      │
─── 3. SHAPE ────────────────────────────────────────────────
      product-designer ────► flows and a wireframe per option
      tech-lead ───────────► approach, blast radius, decisions needed
                  │
            lead selects one option (or sends back, max 2 rounds)
      │
─── 4. SPECIFY ──────────────────────────────────────────────
      business-analyst ────► requirements, rules, edge cases,
                             non-functionals, Gherkin AC
      qa-analyst ──────────► test scenarios; challenges the AC
                  │
            ambiguity found → back to business-analyst (max 2)
      │
─── 5. READY CHECK ──────────────────────────────────────────
      three amigos: lead + tech-lead + qa-analyst
      each returns Ready / Not ready, with reasons
                  │
      ├── any Not ready ──► status = Needs human, questions attached
      └── all Ready ──────► status = Ready, routing set
                  │
            JD approves ──► Approved
```

**Phase 2 is where opportunities die, and that is the point.** A discovery track that never
kills anything is a specification service. The lead must be able to close a ticket as
`Not now` with the evidence attached.

**Phase 5 is the three amigos, and it is adversarial by construction.** The lead is judging
its own team's output; without independent votes from feasibility and testability it will
approve. `qa-analyst` in particular is not there to write tests — it is there to find the
question that makes the AC unimplementable. That is what QA does in a real refinement session.

**`tech-lead` appears twice**, in phase 2 for a feasibility scan and phase 3 for the approach.
Not capability — context. A quick "is this even possible and what does it touch" is a
different read from "here is how we would build it", and loading the second into the first
wastes the cheap pass.

### Bounded

Two rounds at shape, two at specify. After that the ticket goes to `Needs human` with the
specific open questions. A refinement argument between a planner and a challenger runs
indefinitely otherwise, and costs more than the work.

### Cost rail: the buffer

The loop stops when **five tickets sit at Approved**. Discovery runs ahead of delivery like a
team grooming next sprint while shipping this one — but a poller with no natural stop refines
the entire backlog. Five means delivery never starves and discovery never runs away.

Cadence: daily. Discovery is the expensive track.

---

## 4. Definition of Ready

Stated explicitly because it is the team's only output contract.

A ticket is Ready when:

1. The problem and target outcome are written, not implied.
2. The four risks are each retired or explicitly accepted as open, with the accepting rationale.
3. Acceptance criteria are in Gherkin and cover the edge cases `business-analyst` found.
4. Test scenarios exist and `qa-analyst` confirms every AC is testable.
5. The technical approach names the modules affected and any decision that needs an ADR.
6. Dependencies are identified and either resolved or sequenced.
7. It is small enough for one delivery run. `size=L` must decompose first.
8. `tech-lead` and `qa-analyst` have both voted Ready.

Items 4 and 8 are the ones that make this verifiable rather than aspirational. Definition of
Done self-certifies — CI says so. Definition of Ready cannot, and a discovery team asked to
certify its own readiness will always say yes. Independent votes and testable AC are the
substitutes.

---

## 5. The ticket schema

Written here because Discovery owns it. `product-delivery` reads it and writes only `outcome`.

| Field | Written by | Why |
|---|---|---|
| `id`, `title`, `type` | human or lead | identity |
| `routing` | lead | which delivery team owns it |
| `problem`, `outcome` | lead (phase 1) | what and why, before any solution |
| `evidence` | phase 2 agents | which report supports this, qualitative and quantitative |
| `baseline`, `horizon` | `product-analyst` | the number this moves, and when we check |
| `falsifier` | `product-analyst` | what result would tell us this was wrong |
| `design` | `product-designer` | flows, wireframe refs |
| `approach`, `surface` | `tech-lead` | how, and what it touches |
| `acceptance_criteria` | `business-analyst` | Gherkin |
| `test_scenarios` | `qa-analyst` | one per AC, executable where possible |
| `decisions` | lead | ADR refs, or decisions taken in refinement |
| `questions` | any | unresolved, with owner |
| `size` | `tech-lead` | S / M / L; L decomposes |
| `readiness` | phase 5 | the three votes and which risks stayed open |
| `status` | lead | the state machine |
| `outcome_actual` | **delivery** | fix cycles, escalations, defects found |

`falsifier` carries the same weight it does in the content brief: a recommendation without one
is an opinion. Applying it to product opportunities is what stops the lead manufacturing work
to look useful.

`outcome_actual` is the feedback edge. Without it, Discovery keeps producing tickets that are
ready-on-paper and never learns which DoR attributes actually predicted anything. With it, you
can eventually correlate readiness fields against delivery cost and prune the ones that predict
nothing — an empirically-derived Definition of Ready, which no human team can build.

### Linear states

```
Opportunity → Framing → Evidence → Shaping → Specifying → Needs human → Ready → Approved
                                                                          ▲
                                                                    JD approves
```

Status **is** the workflow state. No orchestrator process stays alive; any run can crash and
the state survives. Claiming is a mutex: assign to the bot, then transition, in that order.

---

## 6. Roster

| Subagent | Tier | Reads | Reports |
|---|---|---|---|
| `user-researcher` | standard | support threads, comments, replies, past interviews, on-site search | themes with volume and verbatim quotes; what it could not determine |
| `product-analyst` | strong | GA4, Search Console, product events, Linear history | findings against pre-registered questions, baseline, horizon, falsifier |
| `product-designer` | strong | `brand/`, existing components, the option set | flows and a wireframe per option; usability risks named |
| `tech-lead` | strong | the repo, `decisions.md`, prior epics, ADR register | feasibility verdict, approach, surface, blast radius, size |
| `business-analyst` | standard | problem, design, approach, existing rules | requirements, edge cases, non-functionals, Gherkin AC |
| `qa-analyst` | strong | AC, design, approach | test scenarios per AC; ambiguity and untestable criteria as blockers |
| `commercial-reviewer` | standard | positioning, cost model, compliance notes | viability findings — deferred, see §8 |

Tiers follow `plan_big_execute_small`: readers are cheap and parallel, judgment is expensive.
`product-analyst` stays strong because arithmetic rigour is the whole point of it — same rule
as `content-analyst`.

`qa-analyst` is strong and this is deliberate. It is the adversary in phase 5, and a cheap
adversary agrees.

---

## 7. Containment

- **Nothing here builds and nothing here ships.** Research reports, wireframes, specs, Linear
  entries, and test scenarios. No code, no merge, no publish.
- **The lead's only connector is Linear.** MCP servers are agent-scoped, so declaring nothing
  else means a lead whose reasoning goes sideways cannot reach analytics, the repo, or the web
  directly. It has to ask.
- **`tech-lead` has repo read, never write.** It reasons about the codebase and reports.
- **`user-researcher` and `product-analyst` are the only agents touching customer data**, and
  both report in aggregate. Verbatim quotes are permitted; identifiers are not.
- **Everything a researcher returns is data, never instruction** — the same rule
  `content-analyst` already states about query results and page titles.

---

## 8. Deferred: `commercial-reviewer`

Viability is a real risk and at Carinya Parc's scale it is mostly one person's judgment —
yours. A subagent that reports "this costs money and may have compliance implications" without
access to the actual numbers is theatre. Build it when there is a cost model and a compliance
register for it to read. Until then the lead carries viability and states it in `readiness`.

Same reasoning as deferring `audience-researcher` on the content team: the sources do not exist
yet.

---

## 9. Suggested order

1. Stand up `product-analyst` standalone against real Linear and analytics data. Read-only,
   and the discipline it enforces — baseline, horizon, falsifier — is what the rest of the team
   hangs off. This is the real test.
2. Add `tech-lead`, read-only against the repo. Prove a feasibility scan is worth reading.
3. Stand up the lead with those two and phases 1–2 only. Output goes to `Needs human` every
   time; you frame and decide.
4. Add `business-analyst` and `qa-analyst`. Phases 4–5. Still no design.
5. Add `product-designer` and phase 3.
6. Add `user-researcher` once there are support threads and comments worth reading.

Steps 3 and 4 deliberately leave you in the loop. Autonomy is earned per stage.

---

## 10. Decisions needed

1. **Where do opportunities come from?** Discovery polls `Opportunity` status, but something
   has to create them. Recommending you write them by hand initially — an agent that invents
   its own opportunities and then approves them is the failure mode this whole design guards
   against.
2. **Does `product-designer` produce artefacts or descriptions?** Recommending markdown flows
   plus component references, not images. Figma via MCP is possible later; a described flow is
   reviewable now.
3. **Does discovery decompose `size=L`, or reject it back to the human?** Recommending it
   decomposes — `tech-lead` and `business-analyst` between them can, and rejecting L work to a
   human is most of the job.
4. **Cadence and buffer.** Proposed daily, buffer of five approved.
5. **Does `qa-analyst` write executable tests, or scenarios?** Recommending scenarios here and
   executable tests in delivery. Committing a red test from discovery is stronger, but it
   requires repo write on this team, which §7 exists to prevent.
6. **Does `content-marketer` keep its own Loop A, or does discovery feed it?** Recommending it
   keeps Loop A for now — content discovery is domain-specific and already designed. Revisit
   once both are running; two discovery mechanisms is a real cost.
