# Repo Control Room

Use `rai repo-control --json` when the session needs a repo-wide management surface instead of jumping straight into one package or one diff.

## What it aggregates

- package graph and changed/impacted package ranking
- workspace registry and active roots
- repo audit hotspots, correction-plan pressure, and repo-health verdict
- frontend presence summary so UI-heavy repos stay visible inside repo management

## Good fits

- monorepos and multi-package repos
- cross-cutting refactors
- deciding which subsystem should become the next Codex goal
