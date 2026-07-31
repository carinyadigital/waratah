# Branch protection — CNT03-03

The merge-commit job in `content-qa.yml` only guarantees anything if a failing check blocks the merge. That requires branch protection on `main`, which is repository configuration, not code — it needs a repo admin to apply once, and to re-apply if the repo is recreated.

## Required settings

On `main`:

- Require status checks to pass before merging: **`gates`** (the `content-qa` job)
- Require branches to be up to date before merging (strict)
- No force pushes, no deletions
- Applies to administrators as well — an admin merge that skips the check is exactly the hole CNT03-02 exists to close

## Apply via gh

`scripts/setup-branch-protection.sh` applies the above with the GitHub CLI. Run it as a repo admin:

```bash
./scripts/setup-branch-protection.sh carinyaparc/carinyaparc
```

## Verify

```bash
gh api repos/carinyaparc/carinyaparc/branches/main/protection --jq '.required_status_checks.contexts'
# expect: ["gates"]
```
