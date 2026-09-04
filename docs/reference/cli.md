---
title: "CLI"
description: "Reference for waratah build, info, and serve."
---

The `waratah` binary compiles an authored `agent/` directory, prints an existing manifest, and accepts local `POST /session` traffic. There is no `init`, `dev`, `eval`, `deploy`, or `logs` command.

```text
Usage:
  waratah build [directory]
  waratah info [directory]
  waratah serve [directory] [--port <port>]

Commands:
  build  Compile agent/agent.ts to .waratah/manifest.json
  info   Report the graph in an existing .waratah/manifest.json
  serve  Accept POST /session on the local loopback interface

Options:
  -h, --help         Show this usage information
  -p, --port <port>  Listening port for serve (default: 3000; use 0 for any free port)
```

`directory` defaults to the current working directory. It must contain `agent/agent.ts` for `build`, and `.waratah/manifest.json` for `info`. `--port` is valid only with `serve`.

In this repository, the workspace script is the same binary:

```bash
pnpm waratah build examples/daily-changes
pnpm waratah info examples/daily-changes
pnpm waratah serve examples/daily-changes --port 3000
```

Unknown commands, extra positionals, and invalid flags exit `2` and reprint usage. Runtime failures exit `1`.

## `waratah build`

```bash
waratah build [directory]
```

Imports `agent/agent.ts` from the target directory, compiles the definition, and writes `.waratah/manifest.json`. Prints `Built <name> at <absolute-path>`.

The agent module must have a default export. Compile reports every discovery diagnostic in one run. A failed compile leaves the previous manifest untouched.

Authors must depend on the `waratah` package root. Authored files should not import `@langchain/langgraph` or `packages/waratah/src/**`.

## `waratah info`

```bash
waratah info [directory]
```

Reads `.waratah/manifest.json` and prints the lead, tools, channels, schedules, and nested subagents. Run this when discovery does not match what you expected.

If the manifest is missing, the command tells you to run `waratah build` first. If the JSON is not a `schemaVersion` 1 manifest, it fails.

## `waratah serve`

```bash
waratah serve [directory] [--port <port>]
```

| Flag | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| `-p, --port <port>` | integer 0–65535 | `3000` | Loopback TCP port. `0` binds any free port. |

Binds `127.0.0.1` only. On success it prints one JSON line:

```json
{"status":"listening","host":"127.0.0.1","port":3000}
```

If the port is in use, it tells you to choose another `--port`. `SIGINT` and `SIGTERM` close the server. A second signal exits immediately.

`serve` accepts sessions and writes `.waratah/session/` plus `.waratah/sessions.db`. It does not run the model/tool loop. See [Sessions](../concepts/sessions.md).

## Recommended loop

1. Edit files under `agent/`.
2. `waratah build` to compile.
3. `waratah info` to confirm discovery.
4. `waratah serve` when you need a local HTTP trigger.

## What to read next

- [Getting Started](../getting-started.md): layout and first compile
- [Sessions](../concepts/sessions.md): `POST /session` contract
- [TypeScript API](./typescript-api.md): `createAgent`, `defineTool`, `defineSchedule`
