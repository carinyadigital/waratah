---
title: "Sessions"
description: "How a delivery becomes a durable session, what POST /session accepts, and which files you can inspect."
---

A **session** is one durable thread. Its id equals the accepted trigger's `deliveryId`. A **turn** is one harness invoke on that thread. A **step** is one checkpointed model, tool, or subagent node.

`waratah serve` exposes a single HTTP route for opening that thread. It does not stream, cancel, compact, or attach an editor protocol.

## `POST /session`

The server listens on `127.0.0.1` only (default port 3000). `Content-Type` must be `application/json`.

```json
{
  "deliveryId": "delivery-one",
  "triggeredAt": "2026-09-04T00:00:00.000Z",
  "message": "Produce today's digest."
}
```

| Field | Required | Notes |
| ----- | -------- | ----- |
| `deliveryId` | Yes | Becomes `sessionId`. Must match `^[A-Za-z0-9][A-Za-z0-9._:+-]*$` (no slashes). |
| `triggeredAt` | Yes | RFC 3339 instant with a timezone offset or `Z`. |
| `message` | Yes | Non-empty. At most 64 KiB. |
| `metadata` | No | Only string values whose keys the server allowlists. The CLI allowlist is empty, so any `metadata` object fails. |

The HTTP handler always records `trigger: "http"`. Schedule ticks in-process use `trigger: "schedule"`; they are not a second URL.

### Responses

| Status | Body | Meaning |
| -----: | ---- | ------- |
| 202 | `{ "status": "accepted", "sessionId": "…" }` | New session. |
| 202 | `{ "status": "duplicate", "sessionId": "…", "duplicateOf": "…" }` | This `deliveryId` was already accepted. The graph is not invoked again. |
| 400 | `{ "error": { "code": "INVALID_REQUEST" \| "PAYLOAD_LIMIT_EXCEEDED", "message": "…" } }` | Bad JSON, bad fields, or oversize message/body. |
| 404 | `{ "error": { "code": "NOT_FOUND", … } }` | Path is not `/session`. |
| 405 | `{ "error": { "code": "METHOD_NOT_ALLOWED", … } }` | Not `POST`. |
| 415 | `{ "error": { "code": "UNSUPPORTED_MEDIA_TYPE", … } }` | Not JSON. |
| 500 | `{ "error": { "code": "INTERNAL_ERROR", … } }` | Accept failed. |
| 503 | `{ "error": { "code": "SESSION_STORE_ERROR", … } }` | Session store unavailable. |

The request body as a whole is capped at 80 KiB. There is no `GET /session/:id/stream`, no follow-up `POST /session/:id`, and no cancel or compact route.

`waratah serve` writes the session and checkpointer entry. It does not run the model/tool loop. A process that supplies `runSession` can invoke the harness after accept; the CLI does not.

## Inspectable session directory

Local accept writes one directory per session:

```text
.waratah/session/<sessionId>/
├── meta.json           # deliveryId, trigger, status, timestamps
├── transcript.jsonl    # user / assistant / tool name+status
└── files/              # materialized session filesystem (findings)
```

Directory names are the session id, percent-encoded so timestamp delivery IDs stay valid path segments.

`meta.json` is how a seen `deliveryId` is detected when a filesystem store is configured. Status is `pending`, `running`, `succeeded`, or `failed`.

The transcript is not traces. It is the inspectable conversation. Tool lines carry **name and status only** — never arguments or payloads.

LangGraph resume stays in `.waratah/sessions.db` (`SqliteSaver`). That blob is not the human store.

## Session filesystem

Harness tools read and write `/session/<id>/…`. Path confinement keeps them inside the session root (`INVALID_SESSION_PATH`). Parallel writers can add distinct paths without clobbering; a subagent's job ends with `/session/<id>/findings/<name>.md`. See [Subagents](../subagents/index.md).

## What to read next

- [CLI](../reference/cli.md): `waratah serve --port`
- [Schedules](../schedules.md): cadence ticks reuse this session identity
- [Getting Started](../getting-started.md): a first `curl` against loopback
