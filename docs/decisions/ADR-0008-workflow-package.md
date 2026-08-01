---
type: ADR
id: ADR-0008
status: Accepted
date: 2026-08-01
owner: jonno
---

# ADR-0008 — Shared workflow package; content gates stay with the content team

## Status

Accepted, 2026-08-01.

## Context

Step sequencing, artifact paths, approval checks, the bounded revision loop, and run-report fragments repeated across agents (and duplicated as two `runReport.ts` files). Extracting everything into a shared package would also pull content-specific gates (brief conformance, claim coverage, Lexical-shaped structure) into the kernel — inventing reuse that does not yet exist.

## Decision

`@carinyaparc/workflow` owns the reusable machine:

- repo path resolution
- gate **runner** and `GateResult` / `SuiteResult` shapes
- bounded revision loop
- human-approval name check
- shared run-report fragments (gate table, unsatisfied list)

Content-specific gates, artifact schemas, and calibration stay in `@carinyaparc/content-pipeline` (content-team owned). Promote a gate to the kernel only when a second team needs it (rule of three).

Studio's `gateLoop` becomes a thin adapter over `revisionLoop`. Distributor and planner keep using `looksLikeAgent` from the workflow package (re-exported from content-pipeline for compatibility).

## Consequences

**Positive.** The next team gets a working revision loop and path layout without inheriting content gates. Artifact path moves stay one file.

**Negative.** Two packages to navigate for content work. Acceptable until a second consumer appears.

## Revisit trigger

A second team needs any content gate; or the content pipeline relocates under `agents/content/pipeline/` as a team package without a `packages/` home.
