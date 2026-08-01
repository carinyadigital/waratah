---
type: Architecture
scope: agent-workforce
version: '3.0'
owner: jonno
status: Draft
last_updated: 2026-07-31
clock: continuous
related:
  - product.md
---

# Agent Platform Architecture

**What this is.** The register, the manifest specification, the policy rules CI enforces, the connection vocabulary, and the CLI. Everything that answers *what acts on our behalf, and what may it touch*.

**Clock.** Continuous. This file churns — every new rule, platform, or connection lands here. Kept separate from `product.md` for that reason.

---

## 1. The central claim

> The manifest is written before the agent code.

Security posture becomes a deliberate design decision, reviewed in a diff, rather than an emergent property of implementation. An agent's blast radius is legible from one file without reading its source, its prompts, or its provider configuration.

Everything in this document exists to make that claim enforceable rather than aspirational — and §9 is honest about where it still isn't.

## 2. Repo layout

```
agents/
└── content/
    ├── team.yaml                 # identity + shared dirs. NEVER policy
    ├── workflow.yaml
    ├── artifacts/                # briefs, packs, drafts, triage, …
    ├── ops/                      # capture, queue, distribution, …
    ├── analyst/                  # agent.yaml + agent/ + tests/
    ├── planner/
    ├── studio/
    ├── qa/
    ├── monitor/
    ├── distributor/
    └── desk/

packages/                         # shared kernel
├── agent-manifest/               # schema, types, loader, R1–R13
├── workflow/                     # paths, gate runner, revision loop, approvals
├── brand/                        # standards layer (hashed dist/)
├── content-store/                # neutral document + CMS port
├── content-store-payload/        # Payload REST adapter only
├── content-pipeline/             # content gates + artifact schemas
└── runtime/adapters/             # claude | cursor-cloud | github-actions

governance/                       # calibration, reviews, delivery workpapers
config/connections.yaml           # the only place vendor names appear
scripts/agents/cli.ts             # list | check | matrix | deploy
```

Discovery: a directory is an agent iff it holds an `agent.yaml`. Team-shared directories are listed in `team.yaml`. **`policy:` must never inherit.**

**`packages/brand/` stays independent of `packages/content-pipeline/`** because it will serve agents outside the content practice.

## 3. The manifest

```yaml
# yaml-language-server: $schema=../../packages/agent-manifest/agent.schema.json
version: 1
name:                    # must match directory name
owner:                   # a human
description:             # one line. what it does and what it may not do
tags: []                 # practice membership, multi-valued

deploy:                  # discriminated union on platform
  platform: claude-managed-agent | vercel-eve | vercel-next-mounted | github-actions | claude-subagent
  # ...platform-specific fields

triggers:
  - type: schedule | chat | repo-event | webhook | manual

policy:
  untrustedInput:        # does it read content it didn't author?
  connections: []        # from config/connections.yaml
  writes: []             # from the writes vocabulary, §5
  approval: none | draft-only | pr-review | human
  spendCapUsd:
  idempotencyKey:

content:                 # optional. content-practice agents. see content/design.md
  voice:
  rubric:
  positioning:
  nThreshold: {}

observability:
  traces: none | platform | otel | both
  alertChannel:
  evals:
```

**`policy` is the load-bearing block.** Everything else describes how the agent runs; `policy` describes what it can do to the world.

## 4. Platforms

| Platform | For | Notes |
|---|---|---|
| `claude-managed-agent` | Scheduled and chat-initiated runtime agents | Current default. Beta — see `decisions/ADR-0002-managed-agents.md`. |
| `github-actions` | Deterministic CI checks, no model calls | Cheapest, most trustworthy |
| `claude-subagent` | Interactive desk surfaces | Human-driven, no deployment |
| `vercel-eve` | Legacy | Superseded. Retained in the enum for migration. |
| `vercel-next-mounted` | Legacy | Superseded. |

The manifest insulates you from platform churn: a move is a `deploy:` block change plus a dispatcher case. That has already been exercised once.

## 5. Vocabularies

**Connections** are declared in `config/connections.yaml` with an owner and rotation policy. Current: `github`, `payload`, `slack`, `sheets`, `ga4`, `gsc`, `ahrefs`, `esp`, `sentry`, `vercel`.

**Writes** — the consequence vocabulary. Ordered by reversibility:

| Write | Reversible? |
|---|---|
| `artifact-store` | Yes |
| `tracker` | Yes |
| `pr-comment` | Yes |
| `slack` | Practically |
| `repo-branch` | Yes |
| `cms-draft` | Yes |
| **`cms-publish`** | **No** |
| **`email-send`** | **No** |
| **`social-post`** | **No** |
| **`repo-main`** | **No** |
| **`vercel-deploy`** | **No** |

The bolded five are *consequential*. R4 governs them.

## 6. Policy rules

CI-enforced by `pnpm agents check`. A rule that cannot be checked is documentation, and is marked as such.

| Rule | Assertion | Enforced |
|---|---|---|
| **R1** | Every `agents/*/` has a schema-valid `agent.yaml` whose `name` matches its directory | ✅ |
| **R2** | Every declared connection exists in `connections.yaml` with an owner and rotation policy | ✅ |
| **R3** | `untrustedInput: true` may not pair with `approval: none` | ✅ |
| **R4** | Any consequential write requires `approval: human` or `pr-review` | ✅ |
| **R4′** | A content agent may declare `cms-draft`; it may never declare `cms-publish` | ✅ |
| **R5** | Any agent with a `schedule` trigger declares `spendCapUsd` | ✅ |
| **R6** | Every agent declares an `owner` and `observability.alertChannel` | ✅ |
| **R7** | Any unattended writer declares `idempotencyKey` | ✅ |
| **R8** | Brand assets are referenced by `dist/` path, never duplicated into an agent | ✅ |
| **R9** | Any agent declaring `cms-draft` names a CMS role whose access rules are asserted by a test in the site repo | ✅ |
| **R10** | No agent may declare a direct database connection | ✅ |
| **R11** | Any agent emitting a `read` artifact declares `content.nThreshold` per connected source; the schema rejects empty-by-omission `alternativeExplanations` and `couldNotDetermine` | ✅ |
| **R12** | Any decision class at review level ≥ 3 references a calibration record with n above threshold and zero severe misses in window | ✅ |

**R3 and R4 are the two that matter.** Everything else is hygiene around them.

**R9 closes the assertion gap via a cross-repo pin.** The cms connection declares `assertion.{repo,testPath,commitSha}` pointing at the publish-denial test in the site repository. See `decisions/ADR-0005-r9-cross-repo-assertion.md`.

**R10 exists because it is the rule most likely to be broken by someone being helpful during a debugging session.** Every guarantee in the CMS access layer becomes decorative the moment an agent holds a direct Postgres credential.

**R11 and R12 are enforced** by `agent.schema.json`, `read.schema.json`, `scripts/agents/rules-extra.ts`, and the calibration ledger under `governance/calibration/`.

## 7. The CLI

```
pnpm agents list [--tag content] [--only name]
pnpm agents check                  # R1–R12. CI gate.
pnpm agents matrix                 # deploy matrix for GitHub Actions
pnpm agents deploy --only name
```

`check` runs on every PR touching `agents/**` or `config/connections.yaml`. It is the whole enforcement surface.

## 8. Artifacts

Content-team artifacts live in `agents/content/artifacts/`. Governance ledgers live under `governance/`. Paths resolve through `@carinyaparc/workflow` `repoPaths()`.

```
agents/content/artifacts/
├── briefs/<slug>.yaml
├── packs/<slug>.yaml
├── drafts/<slug>.json
├── reads/<period>.yaml
├── reviews/<slug>.yaml
├── predictions/<id>.yaml
├── published/                 # local CMS mirror
├── triage/                    # work-queue mirror
├── distribution/              # ESP drafts + send approvals
└── queue.yaml

governance/
├── calibration/               # decision classes, shadow, log
├── reviews/                   # code-review ledger
└── delivery/                  # delivery workpapers
```

Schema-validated on write. The slug is the join key across the tracker, the artifacts, and the CMS document.

## 9. What CI can and cannot check

Being clear-eyed about this is the difference between a security model and a comfortable feeling.

**Can check:** manifest validity, rule conformance, connection registration, schema conformance of artifacts, the existence of the CMS access-assertion pin (R9), gate outcomes.

**Cannot check:**

- **That the provider honours the manifest.** `connections: [ga4]` does not prevent a deployed agent from holding a Slack token. The manifest describes intent; provisioning must match it, and only R9 currently closes that gap for one connection.
- **That `spendCapUsd` is enforced anywhere.** It is currently a number in a file.
- **That instructions match the manifest.** An agent told to do something its policy forbids will fail at the boundary, not at review.
- **Anything about output quality.** That is `content-pipeline`'s job, and it is bounded — see `content/design.md` §12.

> The honest summary: the register makes blast radius *legible*, and makes one guarantee *enforceable*. Legibility is worth a great deal and is not the same as containment.

## 10. Open decisions

| Decision | Trigger to revisit |
|---|---|
| Flat registry vs team directories | ~20 agents, or split CODEOWNERS |
| Whether `spendCapUsd` gets real enforcement | First surprising bill |
| Provider-side attestation of `connections` | If a second connection becomes assertable the way Payload is |
