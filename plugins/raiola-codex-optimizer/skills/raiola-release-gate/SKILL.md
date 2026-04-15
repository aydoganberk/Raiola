---
name: raiola-release-gate
description: "Release and merge gate skill for trust posture, blockers, migration notes, and ship-readiness closure."
---

# raiola-release-gate

Use this skill when a change is important enough that merge and ship decisions must become explicit.

## Focus

- refresh Trust Center and Change Control
- inspect migration notes and rollback hints
- keep approval posture and sandbox posture aligned with risk
- drive merge/ship calls through concrete blockers, not vibes

## Expected moves

- `rai trust --json`
- `rai release-control --json`
- `rai codex managed-export --json` when native managed policy is needed
- prefer `release_gatekeeper` and `trust_analyst` subagents before approval or ship decisions
