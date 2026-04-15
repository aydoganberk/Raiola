---
name: raiola-native-telemetry
description: "Telemetry skill for reading Raiola's native Codex flight recorder and tightening operator posture from real session evidence."
---

# raiola-native-telemetry

Use this skill when the main question is **what actually happened during the Codex session** and how to improve the next run.

## Focus

- inspect native hook telemetry instead of relying on memory
- surface denials, warnings, interruptions, and steering notes
- compare operator intent with real tool behavior and drift points
- tighten the next prompt, slash flow, profile, or automation posture from evidence

## Expected moves

- run `rai codex telemetry --json`
- inspect `.workflow/runtime/codex-control/telemetry/events.jsonl` for the raw stream when needed
- read `.workflow/runtime/codex-control/telemetry.md` for the summarized session story
- update the next `rai codex operator` or `rai codex cockpit` run with what the telemetry revealed

## Good fits

- strict-profile command denials
- repeated network or filesystem warnings
- interrupted sessions that need a cleaner resume path
- prompt drift caused by user steering or skipped preparation
