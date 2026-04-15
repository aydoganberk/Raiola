---
name: raiola-monorepo-control-room
description: "Monorepo-control skill for sequencing impact waves, ownership, and verification across large multi-package repos."
---

# raiola-monorepo-control-room

Use this skill when the repo is a **large monorepo and the next move depends on fan-out, workspace ownership, or verification order**.

## Focus

- turn a wide repo into explicit development waves instead of one giant prompt
- keep workspace coverage and unmapped packages visible
- route into bounded parallel lanes only when the wave shape justifies it
- hand the selected wave into `rai codex operator` or `rai codex cockpit` with clear boundaries

## Expected moves

1. Run `rai workspace-impact --json`.
2. Run `rai monorepo-control --json`.
3. Pick the first wave or the top bottleneck instead of widening immediately.
4. Escalate to `rai monorepo-mode --json` only when the blast radius is wide or repo-wide.
