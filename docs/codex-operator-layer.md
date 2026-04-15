# Codex Operator Layer

Raiola now ships an explicit native Codex operator layer.

## What it adds

- `rai codex operator --goal "..."` generates a native session packet for interactive Codex, `codex exec`, `codex mcp-server`, and `codex app-server`.
- `rai codex cockpit --goal "..." --json` materializes a runnable launch kit with a preferred entrypoint, launch scripts, prompt/context packs, and resume files.
- `rai codex mission --goal "..." --json` materializes an execution capsule with a mission charter, launcher, recovery ladder, trust/release gates, and a resume anchor.
- `rai codex telemetry --json` compiles the hook flight recorder into a reviewable summary so session friction is visible after the run.
- `rai codex managed-export --json` compiles Trust Center posture into a deployable `requirements.toml` template for managed Codex environments.
- `.codex/operator/` carries first-party scaffolds for Agents SDK, app-server usage, cockpit relaunch, telemetry review, eval loops, and large-repo / release runbooks.
- Additional operator-focused subagents and installable skills make the native slash/skill surface richer.

## Why it matters

This turns Raiola from a repo that *describes* good Codex behavior into a repo layer that can actively shape native Codex sessions, relaunch them with continuity, inspect what happened, and deploy the resulting policy to managed environments.

## New operator guarantees

- Worktree orchestration now uses a **validated materialization handoff**: patch bundles are checked in a fresh git worktree before anything lands in the target checkout.
- Each patch bundle carries a materialization manifest and exact file snapshots, so untracked files and rename/delete handoffs can be verified instead of being inferred.
- Auto-merge now requires a clean target checkout before the first handoff, which makes silent drift and accidental local-state blending much less likely.
- Stale-base tasks are surfaced explicitly. If upstream touched the same files after a task worktree was spawned, Raiola blocks the handoff instead of guessing.

## New execution capsule surface

`rai codex mission` sits one level above `operator` and `cockpit`. It is meant for the exact moment when a Codex session must become repeatable, reviewable, and resumable instead of staying as an ad-hoc chat thread. Each mission writes a dedicated folder under `.workflow/runtime/codex-control/missions/<mission-id>/` with:

- `MISSION.md` for the staged charter
- `RECOVERY.md` for interruption / failure recovery
- `launch-mission.sh` so the preferred entrypoint can be relaunched without rebuilding the session by hand
- `mission.json` with machine-readable trust, release, and continuity state

This makes the native layer behave more like an operating system primitive: the task is not only routed, it becomes a durable execution capsule with restart semantics.
