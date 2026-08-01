---
type: ADR
id: ADR-0005
status: Accepted
date: 2026-08-01
owner: jonno
---

# ADR-0005 — R9 after the site repository split

## Status

Accepted, 2026-08-01.

## Context

R9 closed the assertion gap for `cms-draft` by requiring a local test file that exercised Payload access rules in this repository. That mechanism worked because the CMS lived here. The site has moved to `carinyaparc/website`. Keeping a green tick on R9 while asserting nothing would be dishonest; deleting R9 would drop the strongest containment guarantee in the register.

Two options were considered:

1. **Cross-repo pinned assertion.** The cms connection declares `assertion.{repo,testPath,commitSha}`. CI verifies the named test exists at that SHA (sibling checkout or GitHub contents API). The pin bumps when the site repo moves the test.
2. **Downgrade R9 to documented.** Mark it the same way spend caps are marked when the runtime cannot enforce them — lose the enforceable guarantee.

## Decision

Option 1. The cms connection in `config/connections.yaml` carries the pin. Agents declaring `cms-draft` still name `policy.cmsRole`. R9 fails if the pin is missing or malformed. Presence is verified against a sibling `website` checkout or via `gh api` when credentials are available; offline environments accept a well-formed pin without a live fetch.

The asserting test today is `apps/site/src/lib/payload/agent-publish.test.ts` in `carinyaparc/website`.

## Consequences

**Positive.** The publish-denial guarantee remains checkable after the site split. Bumping the SHA is an explicit reviewable change when access rules move.

**Negative.** The pin can go stale if the site merges access changes without bumping `commitSha` here. Mitigated by CODEOWNERS / release checklist and by verifying presence when a checkout is available.

**Fallback.** If SHA pinning proves brittle in practice, reopen this ADR and adopt option 2 explicitly — do not leave R9 green while asserting nothing.

## Revisit trigger

Repeated stale-pin incidents, or inability to verify presence in CI for more than one release cycle.
