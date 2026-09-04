---
title: "TypeScript API"
description: "Public exports from the waratah package root: createAgent, defineTool, defineSchedule, compile, and shared types."
---

Import authoring helpers from `waratah`. Do not import `@langchain/langgraph` or files under `packages/waratah/src`.

```ts
import {
  createAgent,
  defineTool,
  defineSchedule,
  compile,
  WaratahError,
  isWaratahError,
  DEFAULT_LIMITS,
} from "waratah";
```

`compile` is the function `compileAgent`. It is what `waratah build` calls after importing `agent/agent.ts`.

## Authoring

### `createAgent(input)`

Returns an `AgentDefinition`. See [Agents](../agent-config.md) for every field, defaults, and lead-versus-subagent rules.

Throws `WaratahError` with code `INVALID_AGENT` when required fields are missing or mistyped.

### `defineTool({ name, description, inputSchema, execute })`

Returns a `ToolDefinition`. `inputSchema` is any object with `parse(input: unknown)`. `execute(input, context)` must return a `Promise`. See [Tools](../tools/overview.md).

### `defineSchedule({ cron, markdown })`

Returns a `ScheduleDefinition`. Both strings must be non-empty. See [Schedules](../schedules.md).

### `compile({ definition, agentFile, projectRoot })`

Discovers the authored tree, validates lead/subagent scope, writes `.waratah/manifest.json`, and returns a `CompiledAgent`: `{ definition, manifest, graph }`. Authors normally run `waratah build` instead of calling this from application code.

## Errors

`WaratahError` has `code`, `message`, and optional `details`. `isWaratahError(value)` is a type guard.

| Code | Typical cause |
| ---- | ------------- |
| `INVALID_AGENT` | Definition, path, or discovery problem |
| `INVALID_CHANNEL_SCOPE` | Subagent declared channels |
| `INVALID_SCHEDULE_SCOPE` | Subagent declared schedules or a `schedules/` directory |
| `INVALID_SESSION_PATH` | Tool path escaped the session root |
| `DUPLICATE_DELIVERY` | Present on the public union; HTTP duplicates return `202` with `status: "duplicate"` instead of this error |
| `MODEL_ERROR` | `ModelAdapter` failed or returned a malformed result |
| `UNKNOWN_TOOL` | Call name not bound to this agent |
| `TOOL_INPUT_INVALID` | `inputSchema.parse` threw |
| `TOOL_EXECUTION_FAILED` | Authored `execute` failed |
| `SUBAGENT_NOT_DECLARED` | `task` named an unknown child |
| `SUBAGENT_FINDING_MISSING` | Child did not write a non-empty findings file |
| `STEP_LIMIT_EXCEEDED` | Turn exceeded step or per-step tool-call caps |
| `PAYLOAD_LIMIT_EXCEEDED` | Message, body, tool result, or finding too large |
| `SESSION_STORE_ERROR` | Checkpointer or session directory unavailable |

Client-facing HTTP errors stay generic. See [Sessions](../concepts/sessions.md).

## Limits

`DEFAULT_LIMITS` (`HarnessLimits`):

| Field | Value |
| ----- | ----: |
| `maxSteps` | 20 |
| `maxToolCallsPerStep` | 4 |
| `maxToolResultBytes` | 256_000 |
| `maxFindingBytes` | 32_000 |

The HTTP server applies additional caps (64 KiB session message, 80 KiB request body). Those are not on the exported `HarnessLimits` object.

## Types

| Type | Role |
| ---- | ---- |
| `CreateAgentInput` | Arguments to `createAgent` |
| `AgentDefinition` | Normalized definition (`kind`, defaults applied) |
| `AgentKind` | `"lead"` \| `"subagent"` |
| `ToolDefinition` | Authored or built-in tool |
| `ToolExecutionContext` | Second argument to `execute` |
| `Schema<T>` | `{ parse(input: unknown): T }` |
| `ScheduleDefinition` | `{ cron, markdown }` |
| `CompiledAgent` | Compile result |
| `WaratahManifest` | `schemaVersion: 1` manifest |
| `SessionFilesystem` | `read` / `write` / `list` |
| `SessionEntry` | Listed file or directory |
| `SessionId`, `SessionPath`, `TurnId`, `StepId` | Branded identifiers |

`ModelAdapter` is used by the harness and is not exported from the package root. Tests inject a fake; the CLI does not.

## What to read next

- [Agents](../agent-config.md): `createAgent` fields
- [CLI](./cli.md): `waratah build` instead of calling `compile` by hand
- [Responsible Use](../responsible-use.md): deployer obligations
