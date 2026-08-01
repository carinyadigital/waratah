# Carinya Parc

The agent workforce for Carinya Parc — a regenerative farm at The Branch, Upper Hunter NSW. The public site lives in the separate `carinyaparc/website` repository. Docs start at [docs/README.md](docs/README.md).

## Layout

| Path | What |
|---|---|
| `packages/brand/` | The standards layer — positioning (hashed), voice, claim policy, rubric, surfaces. Human-only write; agents read `dist/` |
| `packages/content-pipeline/` | Brief/pack/read/draft contracts and the seven deterministic gates |
| `packages/content-store/` | Provider-neutral document model and CMS port |
| `packages/content-store-payload/` | Payload REST adapter — the only package that names Payload |
| `packages/agent-manifest/` | `agent.schema.json` and manifest types |
| `agents/` | The register — one directory per agent, `agent.yaml` is the source of truth |
| `scripts/agents/` | The register CLI: `pnpm agents list \| check \| matrix \| deploy` (rules R1–R12) |
| `agents/content/artifacts/` | Content-team artifacts: briefs, packs, drafts, reviews, reads, predictions, triage, distribution, ready queue |
| `governance/` | Calibration ledger, code-review records, delivery workpapers |
| `.github/workflows/` | `content-qa` (gates on PR + merge commit), `content-monitor` (weekly invariants), `content-capture`, `agents-deploy` |

## Working locally

```bash
pnpm install
pnpm build:brand          # emit packages/brand/dist (positioning hash etc.)
pnpm test                 # full suite — gates, agents, calibration
pnpm gates                # run the gate suite over agents/content/artifacts
pnpm agents check         # register rules R1–R12
pnpm monitor --external-links skip   # corpus invariants, offline
```

Requires Node and pnpm. No CMS SDK is installed in this repo; staging talks to the site over REST.

## The one-paragraph version

Agents stage, humans publish — enforced by access rules in the site repository, pinned here by R9. Every published claim traces to a source via claim annotations checked by deterministic gates in CI, on the PR and again on the merge commit. A weekly monitor keeps the corpus true to itself and files drift into Triage. The analyst reads the numbers with pre-registered questions and an n-threshold gate against noise; the planner proposes into a capped, human-promoted queue; the distributor drafts sends a human approves one at a time. Review moves from human to agent only on a measured agreement record, and publish/send/spend never does.
