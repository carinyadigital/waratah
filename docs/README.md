# Docs

Entry point for the agent-workforce documentation. Start here, then follow the path that matches the question.

| Document | Job |
| --- | --- |
| [product.md](product.md) | Why the workforce exists, outcomes, refusals, build sequence |
| [architecture.md](architecture.md) | Manifest, platforms, vocabularies, policy rules, CLI |
| [content/design.md](content/design.md) | Content-loop design — standards, tracks, contracts, gates, roster |
| [content/tasks.md](content/tasks.md) | Content delivery — epics, stories, tasks (Linear team `CON`) |
| [decisions/](decisions/) | Accepted architecture decisions (ADRs) |

**Reading order for implementers.** `product.md` §8 → `content/tasks.md` §1 → `architecture.md` (rules and vocabularies) → `content/design.md` for the epic you are building → the ADR it cites.

**Now critical path.** `{CNT01, CNT02} → CNT03 → CNT04`. Details in `content/tasks.md`.
