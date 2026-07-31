# Carinya Parc

The site and agent workforce for Carinya Parc — a regenerative farm at The Branch, Upper Hunter NSW. Docs start at [docs/README.md](docs/README.md); the content-practice design is [docs/content/design.md](docs/content/design.md).

## Layout

| Path | What |
|---|---|
| `src/` | Payload CMS: collections, the `agent` role's access rules, the Lexical claim feature |
| `packages/brand/` | The standards layer — positioning (hashed), voice, claim policy, rubric, surfaces. Human-only write; agents read `dist/` |
| `packages/content-pipeline/` | Brief/pack/read/draft contracts and the seven deterministic gates |
| `packages/agent-manifest/` | `agent.schema.json` and manifest types |
| `agents/` | The register — one directory per agent, `agent.yaml` is the source of truth |
| `scripts/agents/` | The register CLI: `pnpm agents list \| check \| matrix \| deploy` (rules R1–R12) |
| `.agency/` | Artifacts: briefs, packs, drafts, reviews, reads, predictions, triage, calibration ledger, ready queue |
| `.github/workflows/` | `content-qa` (gates on PR + merge commit), `content-monitor` (weekly invariants), `content-capture`, `agents-deploy` |

## Working locally

```bash
pnpm install
pnpm build:brand          # emit packages/brand/dist (positioning hash etc.)
pnpm test                 # full suite — access guarantees, gates, agents, calibration
pnpm gates                # run the gate suite over .agency/content
pnpm agents check         # register rules R1–R12
pnpm monitor --external-links skip   # corpus invariants, offline
```

Requires Node ≥ 20 and pnpm. The Payload integration tests run against a throwaway SQLite database; no services needed.

## The one-paragraph version

Agents stage, humans publish — enforced in code, not by prompt (`src/access/agentCannotPublish.ts`). Every published claim traces to a source via Lexical claim annotations checked by deterministic gates in CI, on the PR and again on the merge commit. A weekly monitor keeps the corpus true to itself and files drift into Triage. The analyst reads the numbers with pre-registered questions and an n-threshold gate against noise; the planner proposes into a capped, human-promoted queue; the distributor drafts sends a human approves one at a time. Review moves from human to agent only on a measured agreement record, and publish/send/spend never does.
