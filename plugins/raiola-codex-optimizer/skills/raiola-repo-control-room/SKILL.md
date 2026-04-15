---
name: raiola-repo-control-room
description: "Repo-control skill for turning package graph, hotspot, and workspace state into a bounded next operator move."
---

# raiola-repo-control-room

Use this skill when the task is **repo-wide, cross-cutting, or ambiguous about which subsystem should go first**.

## Focus

- read repo shape, changed/impacted packages, and workspace posture together
- foreground audit hotspots instead of guessing the next subsystem
- keep frontend presence visible even inside broad repo management
- hand the ranked repo surface into `rai codex operator` or `rai codex cockpit` when the next move needs native Codex execution

## Expected moves

1. Run `rai repo-control --json`.
2. Pick the top hotspot or impacted package instead of widening immediately.
3. Open `rai frontend-control --json` as a second lens when the repo includes a meaningful UI surface.
4. Use `rai codex operator --goal "..." --json` for the selected repo wave.
