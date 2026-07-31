---
type: ADR
id: ADR-0003
status: Accepted
date: 2026-07-30
owner: greg
---

# ADR-0003 — No agent holds a direct database credential

## Status

Accepted, 2026-07-30. Clarified 2026-07-31: scope is every agent, not only `content`-tagged ones. Enforced as policy rule **R10**.

## Context

ADR-0001 puts the design's central guarantee in Payload's access layer: server-side rules, written in TypeScript, living in the repo, reviewed like any other code.

**Payload's Local API skips access control by default.** That is correct behaviour for server-side code that legitimately needs full control, and it is a loaded gun pointed at this design. A direct Postgres connection is the same problem one layer lower.

The realistic failure mode is not malice. It is someone — human or agent — debugging a staging failure at 11pm, finding that the REST path is denied, and reaching for the credential that works. Content agents are the obvious case; website and engineering agents are the tempting exception ("I'm fixing the site, I need the DB"). Same hole either way. Every guarantee in the access layer becomes decorative at that moment, and nothing in the system would notice.

## Decision

**No agent** may declare a database connection in `policy.connections`. Tag does not matter — content, website, engineering, or anything else. Enforced in CI as R10.

Agents that need CMS data reach Payload over REST, as the `agent` role, subject to access control.

Where a narrow Local API endpoint is genuinely needed, it is written as a specific server-side route with its own access check — not as a general capability granted to an agent. No such endpoint exists yet, and the decision to defer it is recorded in the CNT01 task set.

## Consequences

**Positive.** The access layer is the only path, so asserting the access layer (R9) actually asserts something.

**Negative.** Some operations are more awkward over REST than they would be locally. This is the intended cost.

**Watch.** R10 checks the manifest. It cannot check what credentials a deployed agent actually holds — see `architecture.md` §9. The rule makes the violation *visible in a diff*, which is the available guarantee, not containment.

## Revisit trigger

If a legitimate operation cannot be expressed over REST, write the narrow endpoint and record it — do not widen the rule.
