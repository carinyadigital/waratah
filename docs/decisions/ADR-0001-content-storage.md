---
type: ADR
id: ADR-0001
status: Accepted
date: 2026-07-30
owner: greg
---

# ADR-0001 — Payload CMS for content storage and publishing

## Status

Accepted, 2026-07-30.

## Context

The content design's central guarantee is that **the agent stages, a human publishes**. Until this decision, that guarantee was an assertion: the manifest declared `writes: [cms-draft]` and hoped provider configuration honoured it. CI could not check it, and most headless CMSs make the distinction a matter of calling the right API endpoint — which an agent can get wrong, or be talked into getting wrong.

Repo-native MDX was the alternative. It has real advantages: claims can be annotated inline, gates run as plain string work in CI, and the publish gate is a PR merge that already requires a human.

## Decision

Content lives in Payload. Agents authenticate as a Payload user in the `users` collection with `useAPIKey: true` and a role of `agent`.

Three properties follow:

- **The publish denial is code.** With `versions: { drafts: true }` enabled, Payload injects `_status`. The collection's `update` access returns a query constraint on `_status` for the agent role, so the agent can write drafts and cannot promote them. The Admin UI hides Publish and Unpublish for any user whose constraint prevents publishing, so the rule is visible as well as enforced.
- **Provenance is free.** Version history attributes every staged draft to the agent identity. No marker field, no convention to maintain.
- **Revocation is one key.** Rotating or disabling the API key stops the agent without touching anything else.

Field-level access handles the rest: deny the agent `update` on `title`, `slug`, and anything else it has no business touching. Note the asymmetry — collection-level access can return a query constraint, field-level access returns only a boolean. The publish block belongs at collection level; field locks belong at field level.

## Consequences

**Positive.** This is the only place in the design where a manifest assertion becomes verifiable. `writes: [cms-draft]` now corresponds to a named role whose access rules are a file in the repo, which CI can assert still exists. That became policy rule **R9**, and it is the strongest guarantee in the architecture.

**Negative.** Claim annotation gets harder. The MDX approach — marking claims inline with `<Claim id="c3">` so a deterministic gate can check them both ways — has to become a Lexical inline feature, with the gate walking editor JSON rather than parsing text. Equivalent in principle, more work, and dependent on Payload's editor API.

**Negative.** Two systems now hold content state: the CMS document and the `.agency/content/` artifacts. The slug is the join key and `content-monitor` checks it holds.

**Consequential.** Direct database access defeats all of the above. That became **R10**, and is recorded separately as ADR-0003.

## Revisit trigger

If Payload's access-control model changes such that collection-level query constraints no longer gate `_status`, the central guarantee reverts to an assertion and this decision should be reopened immediately.
