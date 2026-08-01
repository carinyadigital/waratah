---
type: ADR
id: ADR-0007
status: Accepted
date: 2026-08-01
owner: jonno
---

# ADR-0007 — Team-bounded contexts and the shared kernel

## Status

Accepted, 2026-08-01.

## Context

A flat `agents/<name>/` registry conflates discovery with ownership. Tags carry cross-cutting membership well; directories carry ownership poorly when a second team appears. Meanwhile agents could deep-import any package's `src/` because they were not workspace members, so `exports` maps were decorative.

## Decision

**Physical layout groups by team; the logical registry stays flat.** Discovery globs `agents/*/*/agent.yaml` (and still accepts a flat `agents/*/agent.yaml` during transition). An agent's global identity is its fully qualified directory name (e.g. `content-analyst` under `agents/content/`), matching `name:` in the manifest. Short role directories are discouraged so two teams cannot both own an ambiguous `analyst/`.

Each team directory holds:

- `team.yaml` — identity, shared dirs, extension schema pointer. **Never policy.**
- `workflow.yaml` — step sequence for that team's work.
- `artifacts/`, `ops/`, `pipeline/` as needed — declared in `team.yaml` so completeness is checkable.
- One subdirectory per agent.

**Shared kernel** lives under `packages/`: `agent` (manifest + rules), `workflow`, `brand`, `content-store`, `runtime`. Team-specific gates and schemas stay in the team until a second team needs them (rule of three).

**Workspace membership.** `pnpm-workspace.yaml` includes `agents/*/*`. Each agent declares package dependencies; relative deep imports become package specifiers.

**R13.** `packages/` may not import from `agents/`. An agent may not import from another team. Vendor SDKs only in their adapter package.

## Consequences

**Positive.** CODEOWNERS and deploy cadence can follow the tree. Package manager enforces half of R13 before CI. Tags remain free for cross-cutting membership.

**Negative.** Paths deepen; schema `$ref`s and CI path filters need updating once.

## Revisit trigger

A third team, or an agent that genuinely belongs to two teams' ownership trees (resolve with a primary team directory plus tags, not a second copy).
