# `product-delivery` — team design for review

**Status:** draft, for JD review. Nothing built.
**Date:** 03/08/2026
**Supersedes:** the `ralph-loop` engineering-delivery preset as the orchestration mechanism. The preset's *step definitions* survive as skills.
**Companion to:** `product-discovery.md` (the other track), `content-marketing-team.md` (establishes the conventions this follows).

One deployable team. `delivery-lead` is the lead and the only agent with a schedule. Its
subagents hold no clock — they are spawned at runtime, in their own isolated threads.

**Target outcome: Definition of Done.** Delivery takes a ticket at `Approved` and produces a
merge request that meets every acceptance criterion, with the evidence attached. It does not
decide what to build and it does not merge.

---

## 1. The lead is a dispatcher, not a judge

This is the one structural difference from `product-discovery` and `content-marketer`, and it
changes the whole design.

Content has no oracle, so `content-marketer` must judge whether a draft is good. Discovery has
no oracle, so `product-manager` must judge whether work is ready. **Delivery has an oracle** —
tests, types, lint, build, and the test scenarios discovery already wrote. CI answers "is this
correct". The lead only resolves the next step from ticket status and dispatches.

Consequences:

- The lead runs at **standard** tier, not strong. It is reading a state machine, not forming a
  view.
- The sequence is deterministic. It is known in advance and does not need reasoning about;
  every LLM decision about who goes next is a coin flip you pay for.
- **Deterministic gates run before any reviewer, always.** Never spend an LLM review round on
  something the compiler answers. This is the largest cost saving in the design.

---

## 2. Shape

```
agents/product-delivery/
  agent.yaml            lead identity, model tier, roster, permissions
  instructions.md       the step machine
  connectors/           linear only
  schedules/            one loop
  subagents/
    engineer/
    code-reviewer/
    qa-engineer/
    ux-reviewer/
    drift-checker/      (phase 2, §8)
    integrator/
  dist/
```

Delivery is not engineering-only either. `qa-engineer` and `ux-reviewer` are peers of
`engineer`, not services it calls — the same way a real squad works. Code passing review is not
Done; Done is the AC demonstrably met.

---

## 3. The loop

```
poll Linear: status=Approved, routing=product-delivery, assignee=none, priority order
      │
   claim: assign bot, status=In progress                      ◄── mutex
      │
─── BUILD ───────────────────────────────────────────────────
  engineer ──────────► implementation
      │
  integrator ────────► lint, typecheck, unit tests, build     ◄── FIRST
      │                fail → back to engineer (max 2)
      │
─── REVIEW ──────────────────────────────────────────────────
  code-reviewer ─────► findings by severity; never edits
      │                blocking → back to engineer (max 3)
      │
  ux-reviewer ───────► only when the diff touches UI
      │                blocking → back to engineer (max 2)
      │
─── VERIFY ──────────────────────────────────────────────────
  qa-engineer ───────► runs discovery's test_scenarios, exploratory pass
      │                against the AC, documents defects
      │                defects → back to engineer (max 2)
      │
─── SHIP ────────────────────────────────────────────────────
  integrator ────────► commit, push, open MR, write outcome_actual
      │                status = In review
      │
   JD reviews and merges
```

**Revision returns to the same `engineer` thread.** Threads persist, so the worker still has
its own diff in context. Fixing your own code against someone else's findings is correct and
normal — the judgment came from elsewhere, which is what separation of duties requires. The
revise loop is native, not something we build.

**`qa-engineer` runs after review, not before.** Reviewing a diff and verifying behaviour are
different jobs with different evidence, and running QA against code that still has blocking
findings wastes the expensive pass.

**Budget exhaustion halts. It does not advance.** The `ralph-loop` behaviour — record under
`## Notes` and proceed — was safe when you read every epic at the end. Running unattended and
repeating, it is a schedule for knowingly shipping code that failed review three times.
Unresolved blocking findings or defects set status to `Needs human` and stop, with the findings
on the ticket.

### WIP limit of 1

One ticket in flight. Writes stay single-threaded at the repository level; two tickets against
main is a rebase problem no agent should be discovering on your behalf. Simplest possible answer
to branch contention, relaxable per-epic later if throughput justifies it.

Cadence: continuous. Cost rails: max tickets per day, max iterations per ticket, hard spend
ceiling per run. Kill switch: remove the `agent` label in Linear.

---

## 4. Definition of Done

Stated explicitly because it is the team's only output contract, and because "the reviewer was
happy" is not it.

A ticket is Done when:

1. Every acceptance criterion is demonstrably met, with `qa-engineer`'s evidence attached.
2. Every `test_scenario` from discovery has been executed and passes.
3. Automated tests, types, lint, and build are green.
4. `code-reviewer` has no unresolved blocking findings.
5. `ux-reviewer` has no unresolved blocking findings, where the diff touches UI.
6. New behaviour has test coverage written by `engineer`.
7. Any decision worth an ADR has one, and `decisions.md` records the pattern introduced.
8. The MR is open with findings, defects, and evidence in the body.
9. **JD has merged it.** Nothing on this roster can.

Items 1–2 are why `qa-engineer` exists as a peer. Item 9 is why `integrator` is the only agent
with a credential.

---

## 5. Roster

| Subagent | Tier | Reads | Writes |
|---|---|---|---|
| `engineer` | strong | ticket, AC, `approach`, `surface`, `decisions.md` | sandbox filesystem only |
| `code-reviewer` | strong | diff, ticket, AC, `decisions.md` | nothing — findings by severity |
| `qa-engineer` | strong | `test_scenarios`, AC, the running build | defect reports; test code in sandbox |
| `ux-reviewer` | strong | rendered UI, `design`, `brand/` | nothing |
| `drift-checker` | standard | diff, `decisions.md`, epic history | nothing |
| `integrator` | fast | test output, diff, findings | git push (feature branches), MR API, Linear |

**`code-reviewer` is never a lower tier than `engineer`.** A cheap reviewer rubber-stamps, and
a rubber-stamping reviewer silently deletes the entire separation-of-duties benefit while still
costing three fix rounds of theatre. Reviewing is not the easier job — you have to hold the
intended behaviour in mind and notice what is absent.

**`code-reviewer` and `ux-reviewer` never edit.** They report findings by severity and hand
back. The lead decides what to action. An agent that both critiques and rewrites collapses two
jobs and you lose the record of what was objected to — the same rule as `reviewer` on the
content team.

**`integrator` is the only agent holding a write credential.** Mechanical work — run the gates,
commit, push, open the MR, update Linear — so it is the cheapest agent on the roster and
simultaneously the only choke point for anything leaving the sandbox.

---

## 6. Containment

- **Nothing merges.** Feature branches and MRs are reversible; main is not. This holds the
  irreversible-action line structurally rather than by relying on an approval gate firing.
- **The lead has no repo access.** Linear is its only connector. A lead with repo write
  eventually writes to it, and a lead that can code will code instead of dispatching. MCP
  servers are agent-scoped, so declaring nothing else means it has to ask.
- **`engineer` has no git credentials and no network.** Filesystem in the sandbox, nothing
  else. Everything it produces leaves through `integrator`.
- **No subagent holds a merge credential**, so there is nothing in the session vault for a
  compromised thread to reach. This is why keeping the roster read-only-or-drafting matters
  more than it looks.
- **The bot user needs branch-write and MR scope but no merge permission**, enforced in the git
  host — not only in `agent.yaml`.

---

## 7. What flows back

`integrator` writes `outcome_actual` to the ticket at ship: fix cycles used per stage,
escalations, defects `qa-engineer` found that review missed, whether the budget was exhausted.

Discovery reads it at refinement. This is the edge that stops the two tracks decoupling — the
classic dual-track failure, where discovery becomes a ticket factory and delivery becomes a
queue with no signal between them. In a human team the fix is that the same people span both
tracks. Here it has to be the data.

**The standup.** The lead writes a daily note: shipped, blocked, needs-you. Cheap, and it is
how you stay the lead without being the orchestrator.

The metric that says whether this is working is **human touches per shipped ticket, trending
down**. The metric that says whether *discovery* is working is the proportion of tickets
reaching `In review` with no escalation.

---

## 8. Deferred: `drift-checker`

Fresh context per ticket is the strength of this architecture and also its weakness. Nobody
sees the accumulating shape, so ticket 9 reinvents what ticket 4 built. `drift-checker` reads
the diff against `decisions.md` and reports divergence from patterns set earlier in the epic.

Deferred to phase 2 — build it once two epics have run and `decisions.md` has content worth
checking against. Until then `code-reviewer` carries it with `decisions.md` in its read scope,
imperfectly.

`decisions.md` itself is **not** deferred. `integrator` appends one line at commit on what
pattern or abstraction was introduced. `tech-lead` reads it in discovery, `engineer` and
`code-reviewer` read it here. It costs almost nothing and everything downstream depends on it.

---

## 9. What the build needs

Beyond the five gaps in `content-marketing-team.md`, which block every team:

**a. Skills must take structured input.** `/implement` says *"pass the task ID after the skill
name"* — phrasing for a human at a keyboard, with no equivalent for a scheduled run. If skills
need rewriting per surface, `ralph-loop` and the deployed agents become forks rather than a
shared library, and every improvement has to be made twice. The fix runs one direction only:
structured input is the primary contract, human invocation is a thin wrapper over it. **Resolve
this before anything else** — it is the `crew` versus `ralph-loop` duplication surfacing in a
new place.

**b. A QA workspace primitive.** `qa-engineer` needs the build running to exercise it. The
`deploy-qa` skill assumes a human prepared the workspace; unattended it has to provision,
install, and verify readiness itself, and report cleanly when it cannot.

**c. Linear status and label conventions**, plus the bot user and permission boundary in §6.

---

## 10. Suggested order

Prove one worker unattended before building five more.

1. Fix the skills-input contract (**9a**). Nothing else matters until a skill runs unattended.
2. Stand up `code-reviewer` standalone against real MRs. Read-only, highest leverage, and a
   wrong output costs a bad comment rather than bad code. **This is the real test.**
3. Add `integrator` and the Linear conventions. Now something can move a ticket.
4. Stand up the lead with `engineer`, `code-reviewer`, `integrator` only, against tickets **you**
   mark Approved by hand. No discovery yet, no QA, no UX.
5. Add `qa-engineer` and the QA workspace primitive. Definition of Done becomes real.
6. Add `ux-reviewer`.
7. Add `drift-checker` once two epics have run.

Step 4 deliberately leaves you as the approver. Autonomy is earned per stage, not designed in.

---

## 11. Decisions needed

1. **Does `engineer` write the acceptance tests?** Recommending no — `qa-engineer` executes
   discovery's `test_scenarios`, and `engineer` writes unit tests only. A component that writes
   both the code and its own oracle has no oracle.
2. **Does `qa-engineer` get repo write for test code?** Recommending sandbox-only, with test
   code reaching the branch through `integrator` like everything else.
3. **One `engineer` per ticket, or a fresh thread per revision?** Recommending the same thread —
   it keeps the diff in context and is the whole reason persistent threads exist.
4. **Does the MR open on defects found, or halt?** Recommending halt to `Needs human`. An MR
   with known unmet AC is a review request nobody should have to make.
5. **Where does `ralph-loop` live after this?** Recommending it stays as the attended, portable,
   open-source surface — same step definitions, human at the keyboard, works in Cursor. This team
   is the unattended deployment of the same brain. What must not happen is two divergent copies
   of the step machine.
6. **Model tier for the lead.** Recommending standard, per §1. If it turns out to be making
   judgment calls, that is a signal the step machine is underspecified, not that the lead needs
   a bigger model.
