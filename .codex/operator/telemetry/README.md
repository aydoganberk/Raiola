# Codex Telemetry

Raiola records a native hook flight recorder for Codex sessions so operator guidance can be resumed instead of reconstructed.

## Files

- `.workflow/runtime/codex-control/telemetry/events.jsonl` -> append-only event stream
- `.workflow/runtime/codex-control/telemetry/latest-session.json` -> last session snapshot
- `.workflow/runtime/codex-control/telemetry.json` and `.md` -> generated summary from `rai codex telemetry --json`

## What to look for

- denied commands under strict or locked profiles
- warnings about network, `.workflow/` writes, or missing operator prep
- interruption or steering notes that explain why a session drifted

## Loop

1. Work through the native Codex session.
2. Run `rai codex telemetry --json`.
3. Use the summary to tighten prompts, slash flow, and automation posture.
