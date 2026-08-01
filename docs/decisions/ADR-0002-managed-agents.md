---
type: ADR
id: ADR-0002
status: Accepted
date: 2026-07-31
owner: jonno
---

# ADR-0002 — Managed Agents as the default runtime

## Status

Accepted, 2026-07-31. Supersedes the 2026-07-30 wording that named Claude Managed Agents alone as the default, and supersedes `vercel-eve` as the default platform for scheduled and chat-initiated agents.

## Context

The original architecture put runtime agents on Vercel's eve framework, chosen when it was the most complete option with a real agent abstraction, gateway, and tracing.

Managed-agent products have since matured: scheduled deployments, defined run lifecycles, and failure semantics that match this workforce's dominant trigger type (cron-driven, not request-driven). At the same time, no single vendor covers every role. Knowledge-worker agents and software-engineering agents sit on different craft surfaces and different harnesses today.

Locking the architecture to one provider would either force the wrong harness on half the workforce or invent a second convention outside the platform model. The useful decision is therefore the category — Managed Agents as the default runtime — with the provider chosen per role class and insulated behind `deploy.platform`.

## Decision

**Managed Agents are the default runtime** for scheduled and chat-initiated agents.

The runtime is **provider-agnostic**. The manifest's `deploy.platform` names the provider; moving provider is a `deploy:` block change plus a dispatcher case in the CLI, not a schema or architecture change.

### Initial build / proof

| Role class | Provider | Platform value |
| --- | --- | --- |
| Knowledge workers | Claude Managed Agents | `claude-managed-agent` |
| Software engineering | Cursor Cloud Agents | *(platform enum value to be added when first engineering agent is manifested)* |

`github-actions` remains the platform for deterministic checks with no model calls — `content-qa`, `content-monitor`. That is not a fallback; it is the correct platform, and it is cheaper and more trustworthy than any runtime.

`vercel-eve` and `vercel-next-mounted` stay in the platform enum to keep migration a `deploy:` block change rather than a schema change.

## Consequences

**Positive.** One runtime category across the workforce, with provider choice matched to role class. Craft-layer conventions (Claude-native skills/Cowork for knowledge work; Cursor for engineering) can align with their runtime without forcing a single vendor everywhere. The manifest remains the insulation layer.

**Negative.** Two managed-agent providers means two harness conventions and two sets of operational semantics during the proof phase. Interfaces may change while either product is in beta or early GA.

**Mitigated.** Provider specificity lives only in `deploy.platform` and the CLI dispatcher. A later consolidation onto one provider, or the addition of a third, does not reopen the category decision.

## Revisit trigger

A single provider becoming clearly superior for both role classes; beta-to-GA changes that break scheduled-run lifecycle assumptions; or pricing that makes the spend caps in §6 of `product.md` unrealistic.
