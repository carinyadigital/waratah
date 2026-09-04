# Contributing to waratah

Thanks for your interest in contributing! This guide covers everything you need to get the repo running locally and land a change.

## Prerequisites

- **Node.js 24+** — see [`.nvmrc`](./.nvmrc) (`nvm use` or `fnm use`)
- **pnpm** — the version pinned in [`package.json`](./package.json) (`corepack enable` handles this automatically)

## Getting started

```bash
git clone https://github.com/carinyadigital/waratah.git
cd waratah
pnpm install
pnpm typecheck
pnpm test
```

The repo is a pnpm workspace:

- [`packages/waratah`](./packages/waratah) — LangGraph harness and the `waratah` CLI
- [`examples/daily-changes`](./examples/daily-changes) — Phase 1 waratah fixture

## Development

```bash
pnpm waratah build examples/daily-changes
pnpm typecheck       # TypeScript across the workspace
pnpm test            # unit, integration, and scenario tests (no live credentials)
pnpm test:unit
pnpm test:integration
pnpm test:scenario
```

CI runs the same checks on pull requests and `main`. Running them locally before pushing saves a round trip.

## Before opening a pull request

Search existing [issues](https://github.com/carinyaparc/carinyaparc/issues) and pull requests so you do not duplicate active work. If there is no issue yet, open one describing the problem, use case, or bug reproduction.

To keep reviews manageable:

- Do not send broad rewrites, style-only churn, or generated-output refreshes unless a maintainer asked for them.
- Do not bundle unrelated fixes or refactors into one PR. Split them so each PR has one reviewable purpose.
- Prefer a concrete reproduction, fixture, or test that shows why the change is needed.

## Submitting a pull request

1. Fork the repo and create a branch from `main`.
2. Link any related issue.
3. Make your change, including tests where relevant.
4. Sign off every commit with `git commit -s`.
5. Make sure `pnpm typecheck` and `pnpm test` pass.
6. If you changed `packages/waratah/src` or `packages/waratah/bin`, add a
   changeset with `pnpm changeset` (see [Changesets](#changesets)).
7. Open the PR with a clear description of the problem and solution.

## Changesets

PRs that change the published `waratah` package (`packages/waratah/src` or
`packages/waratah/bin`) must include a changeset so the next npm release can
version and changelog the change.

```bash
pnpm changeset
```

Pick the `waratah` package, then the bump type, then write 1–2 sentences for
the changelog — what changed and what callers will see differently. Because
waratah is pre-1.0:

- **patch** — bug fixes and new features
- **minor** — a public API break

Docs, CI, examples, and other internal tooling do not need a changeset. If you
touched the published sources but the change should not release (tests-only
that also edited `src`, for example), create an empty one with
`pnpm changeset --empty`.

CI comments on each PR whether a changeset is present, and fails when
published sources changed without one.

## Releasing

Releases are automated from `main` by [`.github/workflows/release.yml`](./.github/workflows/release.yml).

1. Merge a PR that includes a changeset.
2. The release workflow opens (or updates) a **Version packages** pull request
   that bumps `packages/waratah` and writes `CHANGELOG.md`.
3. Review that PR, then merge it.
4. The workflow packs `dist/` and publishes `waratah` to npm with provenance,
   then tags the release on GitHub.

The first publish of `0.1.0` happens on the first `main` run that has no
pending changesets, after the trusted publisher below is configured.

### npm trusted publisher (maintainers)

Do not add an `NPM_TOKEN` secret. Publish uses GitHub OIDC.

On [npmjs.com](https://www.npmjs.com/), add a GitHub Actions trusted publisher
for the `waratah` package (this can be done before the package exists):

- **Provider:** GitHub Actions
- **Organization or user:** `carinyadigital`
- **Repository:** `waratah`
- **Workflow filename:** `release.yml` (not a path)
- **Environment:** leave empty

In this GitHub repo, under **Settings → Actions → General**, enable
**Allow GitHub Actions to create and approve pull requests** so the version
PR can be opened.

If you later add a GitHub Environment to the publish job, the npm trusted
publisher must use that same environment name.

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

`waratah` is licensed under the [Apache License 2.0](./LICENSE). By contributing,
you agree that your contributions will be licensed under that same license
(inbound = outbound).
