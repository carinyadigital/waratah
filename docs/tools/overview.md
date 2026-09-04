---
title: "Tools"
description: "Define typed actions the agent can call, and understand the built-in session filesystem tools."
---

A tool is a typed action the agent can call, such as posting a message or reading a session file. Define a tool when you implement the action in code you control. Authored tools run in your app process with access to `process.env`. There is no connection or MCP helper yet.

## Define a tool

`defineTool` takes a name, a description written for the model, an input schema with `parse`, and `execute`:

```ts
import { defineTool } from "waratah";

export default defineTool({
  name: "slack-post",
  description: "Posts a digest to a fixed Slack channel.",
  inputSchema: {
    parse(input: unknown) {
      if (typeof input !== "object" || input === null || Array.isArray(input)) {
        throw new TypeError("Expected digest input");
      }
      const text = (input as { readonly text?: unknown }).text;
      if (typeof text !== "string" || text.trim() === "") {
        throw new TypeError("Expected digest text");
      }
      return { text };
    },
  },
  execute: async ({ text }, context) => {
    return postToFixedChannel(text, context.signal);
  },
});
```

A tool definition needs:

- `name`: the model-facing name. Unique within the agent. Must not collide with built-in names.
- `description`: what the tool does, written for the model.
- `inputSchema.parse(input)`: waratah-owned validation. Any object with a `parse` function is accepted; throwing fails the call with `TOOL_INPUT_INVALID`.
- `execute(input, context)`: the implementation. Must return a Promise.

Placing a file under `agent/tools/` does not expose it. List the tool on that agent's `createAgent({ tools: [...] })`. A model can call only tools bound to the current agent; any other name fails with `UNKNOWN_TOOL`.

### The `context` parameter

`execute` receives a waratah-owned context, not a third-party SDK object:

| Field | Meaning |
| ----- | ------- |
| `sessionId` | Durable session id (equals the accepted `deliveryId`) |
| `turnId` | Current turn |
| `stepId` | Current checkpointed step |
| `agentName` | Agent whose tool set is bound |
| `files` | Session filesystem (`read` / `write` / `list`) |
| `signal` | Aborts when the turn is cancelled |

Do not return secrets, credentials, or unbounded sensitive content from tools. Filter and minimize outputs before returning them.

## Built-in tools

Every harness turn attaches session filesystem tools. Leads also receive `task`.

| Name | Who gets it | Purpose |
| ---- | ----------- | ------- |
| `read` | Every agent | Read a UTF-8 file from the active session |
| `write` | Every agent | Write a UTF-8 file within the active session |
| `list` | Every agent | List immediate entries in a session directory |
| `task` | Lead only | Run one declared subagent. See [Subagents](../subagents/index.md) |

Authored tools must not reuse those names. Compile fails if they do.

Filesystem tools only accept paths inside the active session root (`/session/<id>/…`). A `../` escape fails with `INVALID_SESSION_PATH` before the backend is touched.

There is no built-in `glob`, `grep`, `edit`, `execute`, or planning/todo tool.

## When a tool throws or is denied

If `execute` throws, the harness records a failed tool step and returns an error to the model when the loop continues. waratah does not retry based on exception type or HTTP status. Handle retry inside the tool when the operation is safe, and throw an actionable `WaratahError` when it is not.

Every valid call passes an approval policy before authored code runs. The shipped policy allows every call. There is no public `approval` field on `defineTool` and no human interrupt in the CLI. Do not rely on the model, or on that default policy, to protect a write. See [Responsible Use](../responsible-use.md).

Traces record tool **name and status**, never arguments or payloads.

## Limits

| Limit | Value |
| ----- | ----: |
| Max steps per turn | 20 |
| Max tool calls per step | 4 |
| Max tool result bytes | 256 KiB |

A step that exceeds those bounds fails with `STEP_LIMIT_EXCEEDED` or `PAYLOAD_LIMIT_EXCEEDED`.

## What to read next

- [Subagents](../subagents/index.md): the built-in `task` tool and findings
- [Sessions](../concepts/sessions.md): session paths and inspectable files
- [TypeScript API](../reference/typescript-api.md): `defineTool` and `ToolExecutionContext`
