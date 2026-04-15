---
name: raiola-safety-control-room
description: "Safety-control skill for combining security posture, failure forecasts, and self-healing repair actions into one bounded operator move."
---

# raiola-safety-control-room

Use this skill when the job is **to harden the repo, stop repeat failures, or recover from suspicious changes without widening scope blindly**.

## Focus

- inspect secure-phase findings together with doctor/health failures
- keep repair actions, verification exposure, and incident memory in one decision surface
- tighten the next move before release, automation, or broad monorepo edits continue
- hand the bounded stabilization wave into `rai codex operator` when native Codex execution is the next step

## Expected moves

1. Run `rai safety-control --json`.
2. Open `rai secure --scope repo --json` for high-confidence findings or `rai repair --kind health --json` for operator-surface drift.
3. Check `rai workspace-impact --json` when high-fan-out packages lack verification.
4. Refresh `rai trust --json` after the hardening wave and then continue with `rai codex operator --goal "stabilize the current security and repair wave" --json` if needed.
