---
name: raiola-workspace-impact-planner
description: "Workspace-impact skill for mapping blast radius, development waves, and verification order in monorepos."
---

# raiola-workspace-impact-planner

Use this skill when the question is **what changed, who is affected, and which packages should move first**.

## Focus

- compare direct changes with downstream impacted packages
- keep blast radius and impacted workspaces explicit
- generate wave-by-wave read, write, and verify posture
- avoid repo-wide sweeps when the impact is still containable

## Expected moves

1. Run `rai workspace-impact --json`.
2. Review the first wave and its verify commands.
3. Open `rai review-orchestrate --json` or `rai team-control --json` only if the wave is large enough.
4. Refresh `rai repo-control --json` or `rai monorepo-control --json` before widening the lane.
