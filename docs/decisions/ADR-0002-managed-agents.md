---
type: ADR
id: ADR-0002
status: Superseded
date: 2026-07-31
superseded_by: ADR-0006
owner: jonno
---

# ADR-0002 — Managed Agents as the default runtime

## Status

Superseded by ADR-0006 (2026-08-01). Kept for history.

The original decision — Managed Agents as the default runtime category, provider-agnostic — stands. What changed is *how* provider choice is expressed: `deploy.platform` enums are replaced by `bindings` against an adapter registry.
