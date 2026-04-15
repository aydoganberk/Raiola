# Codex Operator Layer

Raiola uses this directory as the native operator surface for Codex.

## What is here

- `agents-sdk/` -> first-party Codex MCP + Agents SDK scaffold
- `app-server/` -> remote and embedded Codex app-server notes
- `cockpit/` -> launch-kit guidance for `rai codex cockpit`
- `evals/` -> repeatable `codex exec --json` evaluation loop
- `telemetry/` -> hook flight-recorder guidance for `rai codex telemetry`
- `repo-control/` -> repo-wide control-room guidance for `rai repo-control`
- `monorepo-control/` -> large-monorepo control-room guidance for `rai monorepo-control`
- `frontend-control/` -> frontend control-room guidance for `rai frontend-control`
- `safety-control/` -> safety, repair, and failure-forecast guidance for `rai safety-control`
- `runbooks/` -> large-repo and release-gate operating playbooks

## Daily loop

1. `rai codex operator --goal "..."`
2. `rai safety-control --json` when the session should tighten security posture, failure forecasts, or repair actions before editing
3. `rai repo-control --json`, `rai workspace-impact --json`, `rai monorepo-control --json`, or `rai frontend-control --json` when the repo needs a control room before editing
4. `rai codex cockpit --goal "..." --json` when you need a runnable launch kit
5. Start native Codex with `CODEX_HOME=$(pwd)/.codex codex --profile <profile>` or one of the generated cockpit launchers
6. Review `rai codex telemetry --json` before repeating or widening the session
7. Close with Raiola trust/release/handoff surfaces when the task becomes important
