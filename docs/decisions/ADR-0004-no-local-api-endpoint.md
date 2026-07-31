---
type: ADR
id: ADR-0004
status: Accepted
date: 2026-07-31
owner: greg
---

# ADR-0004 — No Local API endpoint is exposed to agents

## Status

Accepted, 2026-07-31. Records the deferral noted in ADR-0003 and CNT01-10.

## Context

Payload's Local API skips access control by default (`overrideAccess` defaults to `true`). That is correct behaviour for server-side code that legitimately needs full control, and it is the single fastest way to make every guarantee in `src/access/agentCannotPublish.ts` decorative. ADR-0003 already prohibits direct database credentials; a general Local API surface handed to an agent is the same hole one layer up.

During CNT01 the question was whether to build a narrow server-side endpoint (for example, a bulk-staging route) alongside the REST path.

## Decision

**No Local API endpoint is exposed.** Agents reach content exclusively over REST, authenticated as the `agent` role, subject to collection- and field-level access control. Nothing currently needed by any content agent requires more than REST provides: staging a draft, updating a draft, reading published content.

## Conditions under which a narrow endpoint would be written

All four, together:

1. A concrete operation that cannot be expressed over REST as the `agent` role — named, with the failing call recorded.
2. The endpoint is a specific route doing one thing, not a general capability.
3. It performs its own access check first — it never calls the Local API with `overrideAccess: true` on behalf of an unverified caller.
4. It ships with an integration test in `tests/access/` asserting the agent role cannot exceed the endpoint's stated scope, wired into `content-qa.yml` like the existing assertions.

Absent any one of these, the answer stays no. Awkwardness over REST is the intended cost (ADR-0003).

## Consequences

**Positive.** The access layer remains the only path, so asserting the access layer (R9, CNT03-04) asserts something real.

**Negative.** Bulk operations are chattier over REST. Accepted.
