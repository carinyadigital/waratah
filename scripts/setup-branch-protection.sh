#!/usr/bin/env bash
# Branch protection requiring the content-qa check.
# Run as a repo admin: ./scripts/setup-branch-protection.sh carinyaparc/carinyaparc
set -euo pipefail

REPO="${1:?usage: setup-branch-protection.sh <owner/repo>}"

gh api --method PUT "repos/${REPO}/branches/main/protection" \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["gates"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON

echo "branch protection applied to ${REPO}@main — check 'gates' is now required"
