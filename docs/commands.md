# Commands

## Product shell

- `cwf setup`
  Install or refresh the workflow product in the current repo.
- `cwf init`
  Bootstrap workflow control-plane files in the current repo.
- `cwf milestone`
  Open a new full-workflow milestone.
- `cwf doctor`
  Verify runtime integrity and install health.
- `cwf hud`
  Show compact workflow state.
- `cwf next`
  Recommend the next safe operator action.
- `cwf checkpoint`
  Write a continuity checkpoint.
- `cwf quick`
  Start, inspect, close, or escalate quick mode.
- `cwf team`
  Plan or operate Team Lite orchestration.
- `cwf review`
  Write `.workflow/reports/review.md`.
- `cwf ship`
  Write `.workflow/reports/ship.md`.
- `cwf pr-brief`
  Write `.workflow/reports/pr-brief.md`.
- `cwf release-notes`
  Write `.workflow/reports/release-notes.md`.
- `cwf session-report`
  Write `.workflow/reports/session-report.md`.
- `cwf update`
  Refresh runtime files while preserving canonical markdown.
- `cwf uninstall`
  Safely remove installed runtime surfaces.
- `cwf benchmark`
  Run the hot-path benchmark harness.

## Quick mode

- `cwf quick start --goal "..."`
- `cwf quick`
- `cwf quick close --summary "..."`
- `cwf quick escalate --summary "..." --open-full-workflow`

## Team Lite

- `cwf team`
- `cwf team start --parallel --activation-text "..."`
- `cwf team status`
- `cwf team stop --summary "..."`
- `cwf team resume`
- `cwf team advance`

## Backward-compatible scripts

- `npm run workflow:setup`
- `npm run workflow:init`
- `npm run workflow:hud`
- `npm run workflow:next`
- `npm run workflow:doctor`
- `npm run workflow:checkpoint`
- `npm run workflow:quick`
- `npm run workflow:team`
- `npm run workflow:review`
- `npm run workflow:ship`
- `npm run workflow:update`
- `npm run workflow:uninstall`

## Command mapping examples

- `cwf milestone` -> `npm run workflow:new-milestone -- --id Mx --name "..." --goal "..."`
- `cwf doctor` -> `npm run workflow:doctor -- --strict`
- `cwf hud` -> `npm run workflow:hud -- --compact`
- `cwf next` -> `npm run workflow:next`
- `cwf checkpoint` -> `npm run workflow:checkpoint -- --next "Resume here"`
