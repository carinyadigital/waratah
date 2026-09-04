# waratah

Filesystem-first TypeScript harness for durable AI agents. An agent is a
directory on disk — instructions, skills, tools, connections, channels,
schedules, hooks, sandbox, and nested subagents are files — and waratah
compiles that directory to a LangGraph `CompiledStateGraph` and runs it.

Requires Node.js 24+.

```bash
npm install waratah
npx waratah build
npx waratah serve
```

```ts
import { createAgent } from "waratah";

export default createAgent({
  name: "exploration-lead",
  model: "anthropic/claude-opus-4.8",
  tools: [...],
  subagents: [],
});
```

Authoring docs: [docs/](../../docs/README.md).

Source, architecture, and contributing guide:
[github.com/carinyadigital/waratah](https://github.com/carinyadigital/waratah).

Licensed under the [Apache License 2.0](./LICENSE).
