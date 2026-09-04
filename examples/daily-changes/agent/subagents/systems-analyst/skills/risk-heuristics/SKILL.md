---
name: risk-heuristics
description: Classify repository risk signals for the daily-changes window.
---

Treat these as risk signals when they appear in the lookback window: unusually large changes; auth, secrets, payments, infra, or deployment paths; dependency and lockfile changes; reversions; merged pull requests with failed or pending CI; schema or migration changes; missing tests where the repository convention makes that signal available. Separate facts from inferences.
