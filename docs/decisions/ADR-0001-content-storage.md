---
type: ADR
id: ADR-0001
status: Accepted
date: 2026-07-30
amended: 2026-08-01
owner: jonno
---

# ADR-0001 — CMS content storage, publish denial, and the content-store port

## Status

Accepted, 2026-07-30. Amended 2026-08-01 for the content-store port and site-repo split.

## Context

The content design's central guarantee is that **the agent stages, a human publishes**. Until this decision, that guarantee was an assertion: the manifest declared `writes: [cms-draft]` and hoped provider configuration honoured it. CI could not check it, and most headless CMSs make the distinction a matter of calling the right API endpoint — which an agent can get wrong, or be talked into getting wrong.

Repo-native MDX was the alternative. It has real advantages: claims can be annotated inline, gates run as plain string work in CI, and the publish gate is a PR merge that already requires a human.

## Decision

Content is published through a CMS. The first provider is Payload, running in the `carinyaparc/website` repository. Agents authenticate as a CMS user with API-key auth and a role of `agent`.

Three properties follow in the site repo:

- **The publish denial is code.** With drafts enabled, collection `update` access returns a query constraint on `_status` for the agent role, so the agent can write drafts and cannot promote them.
- **Provenance is free.** Version history attributes every staged draft to the agent identity.
- **Revocation is one key.** Rotating or disabling the API key stops the agent without touching anything else.

### Content-store port (2026-08-01)

This repository does not depend on a CMS SDK. Staging and published reads go through `@carinyaparc/content-store` (neutral document model + port: `stageDraft`, `findBySlug`, `listPublished`, `capabilities`). `@carinyaparc/content-store-payload` is the only package that names Payload; it is a thin REST client.

Gates and draft artifacts use the neutral `Document` model with claim annotations. They never import a vendor editor format. CMS-specific identifiers (collection names, document ids) stay inside the adapter.

The publish-denial assertion is pinned cross-repo — see ADR-0005.

## Consequences

**Positive.** `writes: [cms-draft]` corresponds to a named role whose access rules are tested in the site repo and pinned here. Swapping CMS providers is an adapter change plus a connections.yaml edit.

**Negative.** Claim annotation is an inline node in the serialized document tree rather than MDX tags — equivalent in principle, dependent on the site editor registering the same node shape the gates walk.

**Negative.** Two systems hold content state: the CMS document and the team artifact store. The slug is the join key and content-monitor checks it holds.

**Consequential.** Direct database access defeats all of the above. That became **R10**, and is recorded separately as ADR-0003.

## Revisit trigger

If the CMS access-control model changes such that collection-level constraints no longer gate publish status, or if a second CMS provider is adopted without fitting the content-store port, reopen this decision.
