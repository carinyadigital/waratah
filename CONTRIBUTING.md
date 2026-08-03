# Contributing to agent

Thanks for your interest in contributing! This guide covers everything you need to get the repo running locally and land a change.

## Prerequisites

- **Node.js 24+** — see [`.nvmrc`](./.nvmrc) (`nvm use` or `fnm use`)
- **pnpm** — the version pinned in [`package.json`](./package.json) (`corepack enable` handles this automatically)

## Getting started

```bash
git clone https://github.com/carinyaparc/carinyaparc.git
cd carinyaparc
pnpm install
pnpm validate
pnpm build
```

The repo is a pnpm workspace:

- [`packages/agent`](./packages/agent) — schema, providers, and the `agent` CLI
- [`agents/`](./agents) — portable agent definitions (one directory per top-level agent; a coordinator's `subagents/` nest one level inside its own directory)
- [`brand/`](./brand) — brand/source material used by agents (when present)

## Development

```bash
pnpm validate        # definitions parse and conform
pnpm build           # render into agents/<name>/dist/<provider>/
pnpm build:check     # fail if dist/ is stale
pnpm typecheck       # TypeScript across the workspace
pnpm test            # Vitest
```

CI runs the same checks on pull requests and `main`. Running them locally before pushing saves a round trip.

When you change an agent definition or the build, regenerate and commit `dist/` so `pnpm build:check` stays green — deploy refuses stale output.

## Before opening a pull request

Search existing [issues](https://github.com/carinyaparc/carinyaparc/issues) and pull requests so you do not duplicate active work. If there is no issue yet, open one describing the problem, use case, or bug reproduction.

To keep reviews manageable:

- Do not send broad rewrites, style-only churn, or generated-output refreshes unless a maintainer asked for them.
- Do not bundle unrelated fixes or refactors into one PR. Split them so each PR has one reviewable purpose.
- Prefer a concrete reproduction, fixture, or test that shows why the change is needed.

## Submitting a pull request

1. Fork the repo and create a branch from `main`.
2. Link any related issue.
3. Make your change, including tests where relevant. If agent definitions or the build change, update committed `dist/` artifacts.
4. Sign off every commit with `git commit -s`.
5. Make sure `pnpm validate`, `pnpm build:check`, `pnpm typecheck`, and `pnpm test` pass.
6. Open the PR with a clear description of the problem and solution.

## Developer Certificate of Origin (DCO)

We do not require a CLA. Instead, all contributions are made under the
[Developer Certificate of Origin (DCO)](./DCO.txt), a lightweight attestation
that you have the right to submit your contribution under the project's
license. There is nothing to sign and no account to create.

Every commit must include a `Signed-off-by` line matching the commit author's
name and email:

```text
Signed-off-by: Jane Doe <jane.doe@example.com>
```

Add it automatically with:

```bash
git commit -s -m "your commit message"
```

If you forget, amend the last commit:

```bash
git commit --amend -s --no-edit
```

To sign off a series of commits, rebase with `--signoff`:

```bash
git rebase --signoff main
```

## Reporting bugs and requesting features

Please use [GitHub Issues](https://github.com/carinyaparc/carinyaparc/issues).

## Code of conduct

This project follows the [Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

## License

`agent` is licensed under the [Apache License 2.0](./LICENSE). By contributing,
you agree that your contributions will be licensed under that same license
(inbound = outbound).
