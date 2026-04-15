# Safety Control Room

Use `rai safety-control --json` when the repo should tighten security posture, forecast likely failures, and review safe repair moves before wider work continues.

## What it aggregates

- secure-phase findings and top risks
- doctor and health failures that indicate operator-surface drift
- self-healing repair actions and manual repair lanes
- workspace-impact exposure for high-fan-out packages without local verification
- incident memory and Codex-native follow-through guidance

## Good fits

- hardening a risky repo before release work continues
- recovering from repeated operator drift or corrupt runtime state
- deciding whether the next move should be secure-phase review, repair review, or trust refresh

## Native follow-through

1. Run `rai safety-control --json`.
2. Inspect `rai secure --scope repo --json` for high-confidence findings.
3. Review `rai repair --kind health --json` before applying any self-healing action.
4. Refresh `rai trust --json` after the stabilization wave.
5. Continue with `rai codex operator --goal "stabilize the current security and repair wave" --json` when the next step belongs in native Codex.
