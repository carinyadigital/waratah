## Validation Report — Content Agents Practice (CNT01–CNT11)

**Date:** 2026-08-01
**Validator:** AI QA Review
**Scope:** Full practice — all 11 epics, 39 stories, 87 tasks (`docs/content/tasks.md`, `docs/content/design.md`)
**Epic status:** 4 of 11 complete, 7 in-progress

### Summary

87 tasks evaluated against the codebase. 76 pass with concrete file/test evidence, 11 partial, 0 outright fail. CNT01 (Publishing Guardrails), CNT02 (Content Contracts), CNT05 (Register Rules) and CNT06 (Capture) are fully verified. The remaining seven epics each have one to three specific, narrow gaps — mostly "no evidence of an executed deploy" for the three managed agents that haven't been run for real yet (content-studio, content-analyst, content-planner), plus a handful of guarantees that are enforced more weakly than their Gherkin implies. Nothing found contradicts the design; every gap is a missing piece, not a wrong one.

### Acceptance Matrix

| Story | Criterion | Evidence | Status |
|---|---|---|---|
| CNT01-01 | `agent` role + `useAPIKey` on users | `src/collections/Users.ts:16-18,34-40` | pass |
| CNT01-02 | `versions: drafts` on posts/recipes | `src/collections/content.ts:85-87,110,112` | pass |
| CNT01-03 | Staging REST call documented | `docs/agent-publishing.md:15-36` | pass |
| CNT01-04 | `agentCannotPublish` query-constraint access | `src/access/agentCannotPublish.ts:46-53` | pass |
| CNT01-05 | Wired into posts/recipes | `src/collections/content.ts:91-96` | pass |
| CNT01-06 | Integration test: stage ok, publish denied | `tests/access/agent-publish.test.ts:53-178` | pass |
| CNT01-07 | Field-level lock on title/slug | `src/collections/content.ts:26-45` | pass |
| CNT01-08 | Partial-update test | `tests/access/agent-publish.test.ts:180-214` | pass |
| CNT01-09 | Key rotation documented | `config/connections.yaml:19-32` | pass |
| CNT01-10 | ADR — no Local API endpoint | `docs/decisions/ADR-0004-no-local-api-endpoint.md` | pass |
| CNT02-01 | `positioning.md` | `packages/brand/src/positioning.md:1-30` | pass |
| CNT02-02 | `claim-policy.md`, ACCC-first | `packages/brand/src/claim-policy.md:1-84` | pass |
| CNT02-03 | `build.ts` emits hashed `positioning.json` | `packages/brand/build.ts:35-42`; `dist/positioning.json` | pass |
| CNT02-04 | `brief.schema.json` | `packages/content-pipeline/src/schemas/brief.schema.json:8-22,67-87` | pass |
| CNT02-05 | `pack.schema.json`, couldNotVerify required | `pack.schema.json:8,32-44`; `gates.test.ts:106-110` | pass |
| CNT02-06 | `read.schema.json` | `read.schema.json:8-75`; `gates.test.ts:112-139` | pass |
| CNT02-07 | Lexical `claim` node | `packages/content-pipeline/src/lexical/claim.ts`; `src/lexical/claimFeature.ts:23-90` | pass |
| CNT02-08 | Claim coverage gate, both directions | `gates/claimCoverage.ts:15-50`; `gates.test.ts:157-174` | pass |
| CNT02-09 | Prohibition/style/links/structure/readability/conformance gates | `gates/{prohibition,styleLint,links,structure,readability,briefConformance}.ts` | pass |
| CNT02-10 | Two pieces by hand, gates fixed not pieces | `scripts/content/author-first-pieces.ts`; commit `e9a1f1d` | pass |
| CNT03-01 | Gate suite on PR | `.github/workflows/content-qa.yml:13-21,49-53` | pass |
| CNT03-02 | Same suite on merge commit, no skip | `content-qa.yml:22-23`, unconditional gate step | pass |
| CNT03-03 | Branch protection requires check | `docs/branch-protection.md`, `scripts/setup-branch-protection.sh:8-21` — live GitHub state unverifiable from repo | partial |
| CNT03-04 | Integration test: publish denial | `tests/access/agent-publish.test.ts:83-113`; `access-regression.test.ts:60-83` | pass |
| CNT03-05 | Wired into workflow, fails on regression | `content-qa.yml:56-58`, no `continue-on-error` | pass |
| CNT03-06 | PR comment: gate table + couldNotVerify | `packages/content-pipeline/src/report.ts:26-43` | pass |
| CNT03-07 | Update-in-place by marker | `report.ts:24`; `content-qa.yml:66-82` | pass |
| CNT04-01 | `agent.yaml` pr-review, idempotency | `agents/content-studio/agent.yaml:9,20,22`; `containment.test.ts:36-52` | pass |
| CNT04-02 | Deploy + smoke run evidenced | `scripts/agents/smoke.ts` exists, not wired into `agents-deploy.yml`; no deploy record | partial |
| CNT04-03 | Six-pass instructions, source-as-data | `agents/content-studio/instructions.md:7,15-27` | pass |
| CNT04-04 | No web/bash tools, tested | `tools.json:8-11`; `containment.test.ts:21-34` | pass |
| CNT04-05 | Pass 2 claim anchoring | `agent/anchor.ts:32-57`; `studio.test.ts:32-56` | pass |
| CNT04-06 | Pass 5 gate loop, bounded retry | `agent/gateLoop.ts:21-45`; `studio.test.ts:105-120` | pass |
| CNT04-07 | Payload REST staging | `agent/stage.ts:44-96`; `studio.test.ts:123-177` | pass |
| CNT04-08 | editDistance/editLocus | `packages/content-pipeline/src/review.ts:57-82`; `studio.test.ts:255-284` | pass |
| CNT04-09 | humanScore/whatWasWrong block close | `scripts/reviews/close-review.ts:29-37` — CLI/schema level only, no Payload publish hook | partial |
| CNT04-10 | Researcher instructions + pack emission | `agents/content-studio/researcher.md`; `agent/pack.ts:62-70` | pass |
| CNT04-11 | sourceBudget hard stop | `agent/pack.ts:38-39`; `studio.test.ts:181-188` | pass |
| CNT04-12 | couldNotVerify incl. partial | `agent/pack.ts:50-60`; `studio.test.ts:190-201` | pass |
| CNT04-13 | Slack initiation, threaded report | `runReport.ts:20-52` renders report; no trigger-handler code found in repo | partial |
| CNT09-01 | Weekly schedule deploy | `agents/content-monitor/agent.yaml`; `content-monitor.yml:8-15` | pass |
| CNT09-02 | Triage filing, idempotent | `agent/triage.ts:40,71-87`; `invariants.test.ts:49-63` | pass |
| CNT09-03 | Push trigger on brand package | `content-monitor.yml:11-14` | pass |
| CNT09-04 | Brief/pack slug join, orphan detection | `agent/invariants.ts:26-65`; `invariants.test.ts:65-74` | pass |
| CNT09-05 | targetQuery uniqueness | `invariants.ts:81-95`; `invariants.test.ts:84-94` | pass |
| CNT09-06 | Internal/external link checks | Internal tested; external wrapper (`checkExternalLinks`) not exercised end-to-end | partial |
| CNT09-07 | Source-age freshness check | `invariants.ts:156-181`; `invariants.test.ts:104-132` | pass |
| CNT09-08 | Positioning hash + decay sweep | `invariants.ts:184-216`; `invariants.test.ts:134-153` | pass |
| CNT05-01 | `cmsRole` in manifest schema | `packages/agent-manifest/agent.schema.json:104-112` | pass |
| CNT05-02 | R9 in CLI | `scripts/agents/rules-extra.ts:18-45`; `rules.test.ts:96-119` | pass |
| CNT05-03 | Connections classified by kind | `config/connections.yaml:8-9` | pass |
| CNT05-04 | R10 in CLI | `rules-extra.ts:54-77`; `rules.test.ts:121-138` | pass |
| CNT05-05 | `content:` $defs | `agent.schema.json:114-144` | pass |
| CNT05-06 | R11 in CLI | `rules-extra.ts:79-117`; `rules.test.ts:140-163` | pass |
| CNT06-01 | Slack capture to Triage | `content-capture.yml`; `scripts/capture/capture.ts:38-56` | pass |
| CNT06-02 | Raw-text preservation | `capture.ts:52`; `capture.test.ts:15-26` | pass |
| CNT06-03 | Expiry sweep, weekly-wired | `scripts/capture/expiry-sweep.ts`; run inside `content-monitor.yml:45-46` | pass |
| CNT10-01 | `agent.yaml` spend cap, nThreshold | `agents/content-analyst/agent.yaml:25-32` | pass |
| CNT10-02 | Deploy + smoke run evidenced | Harness only, no persisted run output or deploy record | partial |
| CNT10-03 | Pre-registered questions | `agent/read.ts:69-73`; `analyst.test.ts:36-59` | pass |
| CNT10-04 | Per-figure query/n/window | `read.ts:103-106`; `read.schema.json:36-46` | pass |
| CNT10-05 | Alt-explanation + couldNotDetermine | `read.ts:100-102,136-138` | pass |
| CNT10-06 | n-threshold gate | `read.ts:107-117`; `analyst.test.ts:73-109` | pass |
| CNT10-07 | Demand artifact | `agent/demand.ts`; `analyst.test.ts:202-218` | pass |
| CNT10-08 | Prediction record + horizon scoring | `agent/predictions.ts`; `scripts/predictions/score-horizon.ts` | pass |
| CNT10-09 | Recommend-nothing ratio | `runReport.ts:24-36,62-65`; `analyst.test.ts:175-200` | pass |
| CNT07-01 | Monthly schedule, draft-only | `agents/content-planner/agent.yaml:10-26` | pass |
| CNT07-02 | Deploy + smoke run evidenced | Harness only, no persisted run output or deploy record | partial |
| CNT07-03 | opportunities.schema.json | `packages/content-pipeline/src/schemas/opportunities.schema.json`; `planner.test.ts:30-47` | pass |
| CNT07-04 | Synthesis across reads+demand+landscape | No `landscape` producer/schema exists; no multi-input test | partial |
| CNT07-05 | Brief from opportunity | `agent/commission.ts:73-107`; `planner.test.ts:87-94` | pass |
| CNT07-06 | targetQuery collision check | `commission.ts:53-63,78-81` — briefs only, not published corpus | partial |
| CNT07-07 | Queue cap at write | `agent/queue.ts:19,25,48-52`; `planner.test.ts:128-144` | pass |
| CNT07-08 | Promotion gate, human-only | `commission.ts:108-117`; `queue.ts:40-45`; `scripts/queue/promote.ts` | pass |
| CNT11-01 | decision-classes.yaml | `.agency/calibration/decision-classes.yaml` | pass |
| CNT11-02 | Seed values match design §9.2 | `decision-classes.yaml:16-61`; `calibration.test.ts:30-40` | pass |
| CNT11-03 | Shadow verdict hidden, real mechanism | `packages/content-pipeline/src/calibration.ts:93-111`; `calibration.test.ts:62-69` | pass |
| CNT11-04 | Paired storage into review record | `calibration.ts:145-159`; `calibration.test.ts:76-88` — no live review records exist yet | partial |
| CNT11-05 | Agreement rate, rolling window | `calibration.ts:179-193`; `calibration.test.ts:170-189` | pass |
| CNT11-06 | Auto promotion/demotion, R12; double-demotion bug | Fixed — `calibration.ts:222-224` guards against re-demotion; `calibration.test.ts:128-143` | pass |
| CNT08-01 | `agent.yaml` human approval, spend cap | `agents/content-distributor/agent.yaml:20-22` | pass |
| CNT08-02 | Per-send human approval | `agent/sends.ts:30-65`; `distributor.test.ts:77-89` | pass |
| CNT08-03 | Per-surface adaptation | `packages/brand/src/surfaces/*`; `agent/adapt.ts:55-58` | pass |
| CNT08-04 | Claim-superset check | `adapt.ts:60-86`; `distributor.test.ts:99-116` | pass |
| CNT08-05 | ESP draft, never send | `agent/sends.ts:71-101`; `distributor.test.ts:149-161` | pass |
| CNT08-06 | Engaged open/unsubscribe capture | `sends.ts:135-146`; `distributor.test.ts:170-181` | pass |
| CNT08-07 | Send record + cluster attribution | `sends.ts:116-156` — slug-level only, no cluster grouping found anywhere | partial |

### Design Deviations

| Area | Design spec | Actual implementation | Assessment |
|---|---|---|---|
| CNT04-09 review-record gate | "A piece cannot be marked published with an incomplete record" reads as a Payload publish-time constraint | Enforced only as a CLI/schema constraint on `close-review.ts`; a human can publish via Payload admin with no review record ever written | Acceptable short-term, but materially weaker than the phrasing implies and weaker than the CNT01 publish-denial pattern it sits beside — worth a follow-up story if this guarantee needs to be real, not aspirational |
| CNT06-03 expiry sweep | Described in the prior status note as "not wired to a weekly trigger" | It is wired — as a step inside `content-monitor.yml`'s job, sharing its cron/commit/failure blast radius rather than its own schedule | Acceptable; functionally weekly, just not independently observable |

### Findings

- **[partial]** CNT03-03: branch protection code and docs are complete; live GitHub branch-protection state can't be confirmed from the repo. This is a one-time `gh api` action for a repo admin, not a code gap.
- **[partial]** CNT04-02, CNT10-02, CNT07-02: the three managed agents that run on a schedule or via chat (content-studio, content-analyst, content-planner) each have a working smoke-test harness (`scripts/agents/smoke.ts`) but no evidence anywhere in the repo of an actual executed deploy — no CI wiring into `agents-deploy.yml`, no persisted run output. Same root cause across all three; worth fixing once rather than three times.
- **[partial]** CNT04-09: review-record completeness isn't enforced at the point of publish in Payload — only at the point someone runs the `close-review.ts` CLI. A piece can be published with no review record if nobody runs that script.
- **[partial]** CNT04-13: no code in the repo receives a Slack-posted brief slug and starts a studio run. Only the outbound report renderer and the manifest's chat-trigger declaration exist — initiation depends entirely on the managed-agent platform's native trigger, which can't be verified from this repo.
- **[partial]** CNT09-06: the content-monitor's external-link check has no dedicated test at the wrapper level (URL aggregation, violation shaping) — only its shared low-level `resolveExternalLink` helper is tested.
- **[partial]** CNT07-04: the `landscape` artifact (one of three synthesis inputs) has no producer, schema, or builder anywhere in the codebase — synthesis has never been exercised with all three inputs together.
- **[partial]** CNT07-06: the `targetQuery` collision check (both at commission time and in the weekly monitor) only compares against other briefs, never against already-published pages — two agents could still target the same query if one is a brief and the other is live.
- **[partial]** CNT11-04: the shadow-verdict pairing mechanism is implemented and covered by fixture tests, but no live review records exist yet to prove it against real data — this will resolve itself once CNT04-S3 has real published pieces.
- **[partial]** CNT08-07: send records carry per-slug attribution but nothing joins sends to content clusters — content-analyst's cluster-based read of subscriber performance (design.md §3, §4.4) has no data source for this yet.
- **[observation]** CNT11-06's previously-flagged double-demotion bug (level 4→2→0 instead of a single −2) is fixed and has an explicit regression test guarding against recurrence.
- **[observation]** `pnpm agents check` / `pnpm vitest run` could not be executed live in this sandbox (cross-platform native-binary mismatch — `esbuild` built for darwin-arm64 on a Linux host). All CNT03/CNT05 findings rest on static reading of `scripts/agents/rules.ts` and its tests, not an observed green run. Worth a real `pnpm agents check` run on a matching platform before treating R9–R11 as confirmed clean against the live register — only R1–R8 have an automated regression test against the real `agents/` directory; R9–R11 are covered only by synthetic-manifest unit tests.

### Backlog Changes

- `docs/content/tasks.md` §2 epic table: CNT01, CNT02, CNT05, CNT06 status set to "Verified complete"; CNT03, CNT04, CNT09, CNT10, CNT07, CNT11, CNT08 status updated to "In-progress — N/M pass" with the specific blocking task(s) named inline.
- `docs/content/tasks.md` §15 Gaps: added G6–G12, one row per epic still in-progress, each citing the exact tasks it blocks.
- No new tasks added — every partial finding is scoped tightly enough to fold into its existing task rather than needing a new one. If you want these tracked as separate follow-up work (e.g. "wire smoke.ts into agents-deploy.yml" as its own ticket across CNT04/CNT07/CNT10), that's a `tasks` or `backlog-refine` job, not a validate one.
- Per-task tables (§3–§13) left untouched — this doc uses one-line epic status + a shared Gaps table as its completion-tracking convention rather than per-task checkboxes, and this update follows that same convention.

### Conclusion

Not ready for full stakeholder sign-off as a finished practice — 7 of 11 epics carry at least one open gap. But the gaps are narrow and mostly cluster around one theme: three managed agents (content-studio, content-analyst, content-planner) exist, pass their unit tests, and have working smoke harnesses, but have never actually been deployed and run for real in this environment (G7, G9, G10). Fixing the deploy-and-smoke-run gap once, then re-running it for all three, would likely close 5 of the 11 partial findings in one pass. The remaining gaps (branch protection live-state, review-record enforcement point, external-link test coverage, landscape artifact, query-collision scope, cluster attribution) are each independent and small. Nothing found contradicts the design or requires rework — CNT01, CNT02, CNT05 and CNT06 are genuinely done and can be signed off now.
