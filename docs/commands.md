# Commands

## Primary verbs

- `cwf launch`
  Strong-start launcher that recommends the lane, first command, and minimal resume prompt.
- `cwf codex`
  Safe Codex control plane. Supports `setup`, `doctor`, `diff-config`, `rollback`, `sync`, role scaffolding, and skill install/remove.
- `cwf do`
  Route a natural-language intent into `quick`, `full`, or `team` lanes with packet/security/verify hints.
- `cwf note`
  Capture a runtime inbox note and optionally promote it into backlog, thread, or seeds.
- `cwf thread`
  Open, list, and resume named thread docs under `docs/workflow/THREADS/`.
- `cwf backlog`
  Add and review canonical backlog items.
- `cwf manager`
  Single-screen operator view with health, next route, team runtime, verify queue, and repair hints.
- `cwf setup`
  Install or refresh the workflow product in the current repo.
- `cwf init`
  Bootstrap workflow control-plane files in the current repo.
- `cwf milestone`
  Open a new full-workflow milestone.
- `cwf doctor`
  Verify install/runtime integrity. Use `--repair` for a dry-run self-heal plan.
- `cwf health`
  Verify workflow/runtime health. Use `--repair` for a dry-run self-heal plan.
- `cwf questions`
  Capture unresolved questions in `docs/workflow/QUESTIONS.md`.
- `cwf claims`
  Track evidence-backed claims in `docs/workflow/CLAIMS.md`, then `check` or `trace` them.
- `cwf secure`
  Run the secure-phase heuristic scan over changed or targeted files.
- `cwf hud`
  Show compact workflow state. `--watch` provides a live HUD.
- `cwf next`
  Recommend the next safe operator action.
- `cwf explore`
  Explore the repo using search, changed-files, workflow, frontend, or repo-structure lenses.
- `cwf verify-shell`
  Run a bounded shell verification command and store normalized evidence.
- `cwf verify-browser`
  Run smoke browser verification, optional `--adapter playwright`, and simple selector assertions.
- `cwf packet`
  Compile, explain, lock, diff, sync, and verify role-aware packets.
- `cwf evidence`
  Build the repo-local evidence graph from claims, verifications, and touched files.
- `cwf checkpoint`
  Write a continuity checkpoint.
- `cwf next-prompt`
  Generate a minimal or full resume prompt for the next session.
- `cwf quick`
  Start, inspect, close, or escalate quick mode.
- `cwf team`
  Plan or operate Team Lite orchestration and the adapter runtime.
- `cwf policy`
  Evaluate the approval matrix for file domains, operations, actors, and policy modes.
- `cwf approvals`
  Record explicit human approvals for risky actions.
- `cwf route`
  Recommend a model preset for the current phase.
- `cwf stats`
  Show benchmark, verification, routing, and runtime telemetry.
- `cwf profile`
  Show the workflow/operator profile and budget defaults.
- `cwf workspaces`
  Show the workspace/workstream registry center.
- `cwf hooks`
  Seed or inspect the disabled-by-default hooks surface.
- `cwf mcp`
  Inspect the repo-local MCP manifest surface.
- `cwf notify`
  Emit a notification smoke event.
- `cwf daemon`
  Show or restart the optional daemon heartbeat.
- `cwf gc`
  Prune old verifications, packet artifacts, and Codex control backups.
- `cwf incident`
  Open or list incident memory entries.
- `cwf fleet`
  Show the current repo operator-center summary.
- `cwf sessions`
  Show workflow, quick, team, and handoff session status.
- `cwf patch-review`
  Review collected patch bundles.
- `cwf patch-apply`
  Apply a collected patch bundle with `git apply --3way`.
- `cwf patch-rollback`
  Reverse an applied patch bundle with `git apply -R --3way`.
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

## Team runtime

- `cwf team`
- `cwf team start --parallel --activation-text "..."`
- `cwf team run --adapter worktree|subagent|hybrid --activation-text "parallel yap" --write-scope src,tests`
- `cwf team dispatch`
- `cwf team monitor`
- `cwf team collect`
- `cwf team mailbox`
- `cwf team timeline`
- `cwf team steer --note "..."`
- `cwf team status`
- `cwf team stop --summary "..."`
- `cwf team resume`
- `cwf team advance`

## Runtime artifacts

- `cwf launch` -> `.workflow/runtime/launch.json`
- `cwf hud` -> `.workflow/runtime/hud.json`
- `cwf manager` -> `.workflow/runtime/manager.json`
- `cwf next-prompt` -> `.workflow/runtime/next-prompt.md`
- `cwf verify-shell` -> `.workflow/verifications/shell/*`
- `cwf verify-browser` -> `.workflow/verifications/browser/*`
- `cwf packet` -> `.workflow/packets/*` and `.workflow/cache/packet-locks.json`
- `cwf evidence` -> `.workflow/evidence-graph/latest.json`
- `cwf codex` -> `.workflow/runtime/codex-control/*` with a virtual repo-local `.codex` root
- `cwf team mailbox` -> `.workflow/orchestration/runtime/mailbox.jsonl`
- `cwf team timeline` -> `.workflow/orchestration/runtime/timeline.jsonl`
- `cwf patch-review` -> `.workflow/orchestration/patches/*`
- `cwf route` -> `.workflow/cache/model-routing.json`

## Backward-compatible scripts

- `npm run workflow:launch`
- `npm run workflow:codex`
- `npm run workflow:do`
- `npm run workflow:note`
- `npm run workflow:thread`
- `npm run workflow:backlog`
- `npm run workflow:manager`
- `npm run workflow:setup`
- `npm run workflow:init`
- `npm run workflow:hud`
- `npm run workflow:next`
- `npm run workflow:doctor`
- `npm run workflow:health`
- `npm run workflow:repair`
- `npm run workflow:questions`
- `npm run workflow:claims`
- `npm run workflow:secure`
- `npm run workflow:explore`
- `npm run workflow:verify-shell`
- `npm run workflow:verify-browser`
- `npm run workflow:packet-os`
- `npm run workflow:evidence`
- `npm run workflow:next-prompt`
- `npm run workflow:route`
- `npm run workflow:stats`
- `npm run workflow:profile`
- `npm run workflow:workspaces`
- `npm run workflow:checkpoint`
- `npm run workflow:quick`
- `npm run workflow:team`
- `npm run workflow:team-runtime`
- `npm run workflow:policy`
- `npm run workflow:approvals`
- `npm run workflow:hooks`
- `npm run workflow:mcp`
- `npm run workflow:notify`
- `npm run workflow:daemon`
- `npm run workflow:gc`
- `npm run workflow:incident`
- `npm run workflow:fleet`
- `npm run workflow:sessions`
- `npm run workflow:patch-review`
- `npm run workflow:patch-apply`
- `npm run workflow:patch-rollback`
- `npm run workflow:review`
- `npm run workflow:ship`
- `npm run workflow:update`
- `npm run workflow:uninstall`

## Command mapping examples

- `cwf launch` -> `npm run workflow:launch`
- `cwf codex` -> `npm run workflow:codex`
- `cwf do` -> `npm run workflow:do -- "..." `
- `cwf note` -> `npm run workflow:note -- "..." `
- `cwf manager` -> `npm run workflow:manager`
- `cwf doctor` -> `npm run workflow:doctor -- --strict`
- `cwf health` -> `npm run workflow:health -- --strict`
- `cwf hud` -> `npm run workflow:hud -- --compact`
- `cwf next` -> `npm run workflow:next`
- `cwf explore` -> `npm run workflow:explore -- "query"`
- `cwf verify-shell` -> `npm run workflow:verify-shell -- --cmd "npm test"`
- `cwf verify-browser` -> `npm run workflow:verify-browser -- --url http://localhost:3000`
- `cwf packet` -> `npm run workflow:packet-os -- compile --step plan`
- `cwf checkpoint` -> `npm run workflow:checkpoint -- --next "Resume here"`
