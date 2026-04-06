# Commands

## Primary verbs

- `cwf launch`
  Strong-start launcher that recommends the lane, first command, and minimal resume prompt.
- `cwf codex`
  Safe Codex control plane. Supports `setup`, `doctor`, `diff-config`, `rollback`, `sync`, role scaffolding, skill install/remove, `profile suggest`, `bootstrap`, `resume-card`, and `plan-subagents`.
- `cwf do`
  Route a natural-language intent into `quick`, `full`, `review`, `frontend`, or `team` lanes with explainable capability and verify plans.
- `cwf note`
  Capture a runtime inbox note and optionally promote it into backlog, thread, or seeds.
- `cwf thread`
  Open, list, and resume named thread docs under `docs/workflow/THREADS/`.
- `cwf backlog`
  Add and review canonical backlog items.
- `cwf manager`
  Single-screen operator view with health, next route, team runtime, verify queue, and repair hints.
- `cwf dashboard`
  Generate `.workflow/runtime/dashboard/index.html`, a local HTML operator surface with command palette, context compiler, route/review/frontend boards, and screenshot state.
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
- `cwf discuss`
  Generate a discuss brief from current workflow state, open questions, and active assumptions.
- `cwf questions`
  Capture unresolved questions in `docs/workflow/QUESTIONS.md`.
- `cwf assumptions`
  Track active assumptions in `docs/workflow/ASSUMPTIONS.md`, including impact and exit triggers.
- `cwf claims`
  Track evidence-backed claims in `docs/workflow/CLAIMS.md`, then `check` or `trace` them.
- `cwf secure`
  Run the secure-phase heuristic scan over changed or targeted files.
- `cwf hud`
  Show compact workflow state. `--watch` provides a live HUD, and `--intent --cost --risk` exposes route, budget, and risk detail.
- `cwf next`
  Recommend the next safe operator action. `--from-gap` biases toward the biggest current trust or review gap.
- `cwf explore`
  Explore the repo using search, changed-files, workflow, frontend, or repo-structure lenses.
- `cwf verify-shell`
  Run a bounded shell verification command and store normalized evidence.
- `cwf verify-browser`
  Run smoke browser verification, optional `--adapter playwright`, and simple selector assertions.
- `cwf verify-work`
  Run the trust-layer verification pass, summarize gaps, and emit a fix plan when needed.
- `cwf packet`
  Compile, explain, lock, diff, sync, and verify role-aware packets.
- `cwf evidence`
  Build the repo-local evidence graph from claims, verifications, and touched files.
- `cwf validation-map`
  Roadmap-compatible wrapper for the validation contract surface.
- `cwf checkpoint`
  Write a continuity checkpoint.
- `cwf next-prompt`
  Generate a minimal or full resume prompt for the next session.
- `cwf quick`
  Start, inspect, close, or escalate quick mode.
- `cwf team`
  Plan or operate Team Lite orchestration and the adapter runtime.
- `cwf subagents`
  Roadmap-compatible wrapper for `cwf codex plan-subagents`.
- `cwf policy`
  Evaluate the approval matrix for file domains, operations, actors, and policy modes from `docs/workflow/POLICY.md`.
- `cwf approval`
  Roadmap-compatible alias for approval planning and grants.
- `cwf approvals`
  Record explicit human approvals in `docs/workflow/POLICY.md` and refresh the derived runtime mirror.
- `cwf route`
  Recommend a model preset and capability for the current phase or explicit goal. Supports `--why`, `replay`, and `eval`.
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
  Run the multi-pass review engine and write `.workflow/reports/review.md` plus structured findings.
- `cwf review-mode`
  Run the deep review engine explicitly.
- `cwf pr-review`
  Review a PR or diff-oriented surface with risk heatmap and blockers.
- `cwf re-review`
  Replay the current diff against the latest review history.
- `cwf ui-spec`
  Generate `docs/workflow/UI-SPEC.md`.
- `cwf ui-plan`
  Generate `docs/workflow/UI-PLAN.md`.
- `cwf ui-review`
  Generate `docs/workflow/UI-REVIEW.md` plus a frontend scorecard.
- `cwf preview`
  Write `.workflow/runtime/preview-gallery.md` from browser artifacts.
- `cwf component-map`
  Generate `docs/workflow/COMPONENT-INVENTORY.md`.
- `cwf responsive-matrix`
  Generate `docs/workflow/RESPONSIVE-MATRIX.md`.
- `cwf design-debt`
  Generate `docs/workflow/DESIGN-DEBT.md`.
- `cwf ship-readiness`
  Score ship readiness from review, evidence, approvals, and verify-work results.
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
- `cwf verify-work` -> `.workflow/reports/verify-work.{md,json}`
- `cwf packet` -> `.workflow/packets/*` and `.workflow/cache/packet-locks.json`
- `cwf evidence` -> `.workflow/evidence-graph/latest.json`
- `cwf ship-readiness` -> `.workflow/reports/ship-readiness.{md,json}`
- `cwf codex` -> `.workflow/runtime/codex-control/*` with a virtual repo-local `.codex` root
- `cwf team mailbox` -> `.workflow/orchestration/runtime/mailbox.jsonl`
- `cwf team timeline` -> `.workflow/orchestration/runtime/timeline.jsonl`
- `cwf patch-review` -> `.workflow/orchestration/patches/*`
- `cwf route` -> `.workflow/cache/model-routing.json`
- `cwf do` / `cwf route` -> `.workflow/cache/intent-route-history.json`
- `cwf dashboard` -> `.workflow/runtime/dashboard/{index.html,state.json}`
- `cwf ui-spec` -> `docs/workflow/UI-SPEC.md`
- `cwf ui-plan` -> `docs/workflow/UI-PLAN.md`
- `cwf ui-review` -> `docs/workflow/UI-REVIEW.md`
- `cwf component-map` -> `docs/workflow/COMPONENT-INVENTORY.md`
- `cwf responsive-matrix` -> `docs/workflow/RESPONSIVE-MATRIX.md`
- `cwf design-debt` -> `docs/workflow/DESIGN-DEBT.md`
- `cwf policy` / `cwf approvals` -> canonical `docs/workflow/POLICY.md` plus derived `.workflow/runtime/policy.json` and `.workflow/runtime/approvals.json`
- `cwf discuss` -> `.workflow/runtime/discuss.{json,md}`

## Backward-compatible scripts

- `npm run workflow:launch`
- `npm run workflow:codex`
- `npm run workflow:do`
- `npm run workflow:note`
- `npm run workflow:thread`
- `npm run workflow:backlog`
- `npm run workflow:manager`
- `npm run workflow:dashboard`
- `npm run workflow:setup`
- `npm run workflow:init`
- `npm run workflow:hud`
- `npm run workflow:next`
- `npm run workflow:doctor`
- `npm run workflow:health`
- `npm run workflow:discuss`
- `npm run workflow:repair`
- `npm run workflow:questions`
- `npm run workflow:assumptions`
- `npm run workflow:claims`
- `npm run workflow:secure`
- `npm run workflow:explore`
- `npm run workflow:verify-shell`
- `npm run workflow:verify-browser`
- `npm run workflow:verify-work`
- `npm run workflow:packet-os`
- `npm run workflow:evidence`
- `npm run workflow:validation-map`
- `npm run workflow:next-prompt`
- `npm run workflow:route`
- `npm run workflow:stats`
- `npm run workflow:profile`
- `npm run workflow:workspaces`
- `npm run workflow:checkpoint`
- `npm run workflow:quick`
- `npm run workflow:team`
- `npm run workflow:team-runtime`
- `npm run workflow:subagents`
- `npm run workflow:policy`
- `npm run workflow:approval`
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
- `npm run workflow:review-mode`
- `npm run workflow:pr-review`
- `npm run workflow:re-review`
- `npm run workflow:ui-spec`
- `npm run workflow:ui-plan`
- `npm run workflow:ui-review`
- `npm run workflow:preview`
- `npm run workflow:component-map`
- `npm run workflow:responsive-matrix`
- `npm run workflow:design-debt`
- `npm run workflow:ship-readiness`
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
- `cwf ui-spec` -> `npm run workflow:ui-spec`
- `cwf ui-review` -> `npm run workflow:ui-review -- --url ./preview.html`
- `cwf ship-readiness` -> `npm run workflow:ship-readiness`
