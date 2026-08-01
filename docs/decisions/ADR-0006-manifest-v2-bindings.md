---
type: ADR
id: ADR-0006
status: Accepted
date: 2026-08-01
owner: jonno
supersedes: ADR-0002
---

# ADR-0006 — Manifest v2: capability, policy, bindings, and the adapter registry

## Status

Accepted, 2026-08-01. Supersedes ADR-0002's packaging of provider choice.

## Context

ADR-0002 correctly chose Managed Agents as the default runtime category and insisted the architecture stay provider-agnostic. The packaging fought that goal: provider names lived in a hard-coded `deploy.platform` enum, schema `allOf`/`if`/`then` blocks encoded per-vendor shapes, and adding a provider meant editing the schema, the CLI dispatcher, the deploy matrix, and the architecture doc.

Meanwhile the `content:` block (nThreshold, clusters, emits) sat in the shared schema — a content-team concern leaking into the kernel.

## Decision

Manifest version 2 splits three blocks with different lifetimes:

- **`capability`** — what the agent is and needs. Portable. Never mentions a vendor.
- **`policy`** — unchanged and load-bearing. Never mentions a vendor. Never inherits.
- **`bindings`** — a list of run targets, each naming a provider and its options. The only vendor-aware block.

Provider names validate against **installed adapters** discovered from `packages/runtime/adapters/*/adapter.json`, not against a hard-coded enum. Each adapter declares modes, an options schema, and what it can enforce (`spendCap`, `schedule`, `secretsIsolation`).

Registered adapters today:

| Provider | For |
|---|---|
| `claude` | Knowledge-worker agents. Modes: `managed`, `subagent` |
| `cursor-cloud` | Software-engineering agents |
| `github-actions` | Deterministic checks, no model calls |

`vercel-eve` and `vercel-next-mounted` are deleted. The write `vercel-deploy` becomes `deploy`.

Team-specific fields move under `extensions:` and are validated against a per-team JSON Schema fragment (content: `packages/agent-manifest/extensions/content.schema.json`).

**spendCapUsd negotiation.** If a binding's adapter declares `spendCap: enforced`, the number is meaningful. If it declares `acknowledged`, the binding must set `spendCapAcknowledged: true`. If `none`, the cap is not required for that binding.

**Connection vocabulary.** Manifests declare capability keys (`cms`, `chat`, `analytics`, …). `config/connections.yaml` is the only file where a vendor/provider name appears.

**R13.** `packages/` may not import from `agents/`. An agent may not import from another team. No package may import a vendor SDK except its own adapter.

## Consequences

**Positive.** Adding a provider is a package, not a schema edit. One agent can bind to multiple providers (dev subagent + prod managed). Capability negotiation makes silent no-ops (spend caps on adapters that cannot enforce them) fail the check.

**Negative.** Migration cost: all manifests move to v2 together. Adapter option schemas must stay honest about what the provider can enforce.

## Revisit trigger

A provider that cannot be expressed as an adapter package; or evidence that `spendCapAcknowledged` is being rubber-stamped without review.
