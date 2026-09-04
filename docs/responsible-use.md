---
title: "Responsible Use"
description: "Deployer responsibility and safeguards to review before using waratah with sensitive or production data."
---

waratah is in preview; the framework, APIs, documentation, and behavior may change before general availability.

As the deployer, it is your responsibility to ensure your agent complies with applicable laws.

You are responsible for configuring tool restrictions, session authorization, telemetry, and other safeguards appropriate for your use case. waratah does not ship a human-approval prompt, a sandbox network policy, or route authentication. The default approval policy permits every valid tool call. `waratah serve` binds loopback only; it does not protect a public port.

Before using waratah with non-public, sensitive, regulated, or production data, review which built-in tools, authored tools, subagents, schedules, and external actions are available to the agent.

Require human approval or other safeguards **in your process** for sensitive, irreversible, regulated, financial, healthcare, employment, housing, legal, safety-impacting, user-impacting, or external side-effecting actions. The framework will not pause those calls for you today.

Do not rely on model behavior alone to prevent sensitive or irreversible actions. Put secrets in adapter closures and environment variables, not in prompts, session files, manifests, traces, or tool output. Traces and transcripts record tool names and status, not arguments or payloads — still keep credentials out of user messages.

Where an agent communicates with people, you may be required to disclose that they are interacting with an automated AI system. waratah does not add that disclosure.
