# Commands

Use `rai help` for the starter flows, `rai help <topic>` for focused categories, and `rai help all` for the full shell.

`rai` is the primary shell. `raiola-on` is the first-run onboarding entry, and `raiola:*` is the repo-local npm fallback namespace.

## Primary verbs

- `rai on`
  Open Raiola onboarding. `rai on next` is the clean blank-state entry and proposes a milestone to start.
- `rai launch`
  Strong-start launcher that recommends the lane, first command, and minimal resume prompt.
- `rai codex`
  Safe Codex control plane. Supports `setup`, `doctor`, `diff-config`, `rollback`, `sync`, role scaffolding, skill install/remove, `profile suggest`, `bootstrap`, `resume-card`, `promptpack`, and `plan-subagents`.
- `rai do`
  Route a natural-language intent into `quick`, `full`, `review`, `frontend`, or `team` lanes with explainable capability and verify plans. English/Turkish persona framing and nearby typos are tolerated on the routing path.
- `rai note`
  Capture a runtime inbox note and optionally promote it into backlog, thread, or seeds.
- `rai thread`
  Open, list, and resume named thread docs under `docs/workflow/THREADS/`.
- `rai backlog`
  Add and review canonical backlog items.
- `rai manager`
  Single-screen operator view with health, next route, team runtime, verify queue, and repair hints.
- `rai dashboard`
  Generate `.workflow/runtime/dashboard/index.html`, a local HTML operator surface with command palette, context compiler, route/review/frontend boards, and screenshot state.
- `rai setup`
  Install or refresh the workflow product in the current repo.
- `rai init`
  Bootstrap workflow control-plane files in the current repo.
- `rai milestone`
  Open a new full-workflow milestone.
- `rai doctor`
  Verify install/runtime integrity and host prerequisites. Use `--repair` for a dry-run self-heal plan.
- `rai health`
  Verify blocking workflow/runtime health. Host-tool advisories stay in `doctor`. Use `--repair` for a dry-run self-heal plan.
- `rai discuss`
  Generate a discuss brief from current workflow state, open questions, and active assumptions.
- `rai questions`
  Capture unresolved questions in `docs/workflow/QUESTIONS.md`.
- `rai assumptions`
  Track active assumptions in `docs/workflow/ASSUMPTIONS.md`, including impact and exit triggers.
- `rai claims`
  Track evidence-backed claims in `docs/workflow/CLAIMS.md`, then `check` or `trace` them.
- `rai secure`
  Run the secure-phase heuristic scan over changed or targeted files.
- `rai hud`
  Show compact workflow state. `--watch` provides a live HUD, and `--intent --cost --risk` exposes route, budget, and risk detail.
- `rai next`
  Recommend the next safe operator action. `--from-gap` biases toward the biggest current trust or review gap.
- `rai explore`
  Explore the repo using search, changed-files, workflow, frontend, or repo-structure lenses.
- `rai verify-shell`
  Run a bounded shell verification command and store normalized evidence.
- `rai verify-browser`
  Run smoke browser verification, optional `--adapter playwright`, and simple selector assertions.
- `rai verify-work`
  Run the trust-layer verification pass, summarize gaps, and emit a fix plan when needed.
- `rai packet`
  Compile, explain, lock, diff, sync, and verify role-aware packets.
- `rai evidence`
  Build the repo-local evidence graph from claims, verifications, and touched files.
- `rai validation-map`
  Roadmap-compatible wrapper for the validation contract surface.
- `rai checkpoint`
  Write a continuity checkpoint.
- `rai next-prompt`
  Generate a minimal or full resume prompt for the next session.
- `rai quick`
  Start, inspect, close, or escalate quick mode.
- `rai team`
  Plan or operate Team Lite orchestration and the adapter runtime.
- `rai subagents`
  Roadmap-compatible wrapper for `rai codex plan-subagents`.
- `rai policy`
  Evaluate the approval matrix for file domains, operations, actors, and policy modes from `docs/workflow/POLICY.md`.
- `rai approval`
  Roadmap-compatible alias for approval planning and grants.
- `rai approvals`
  Record explicit human approvals in `docs/workflow/POLICY.md` and refresh the derived runtime mirror.
- `rai route`
  Recommend a model preset and capability for the current phase or explicit goal. Supports `--why`, `replay`, and `eval`.
- `rai stats`
  Show benchmark, verification, routing, and runtime telemetry.
- `rai profile`
  Show the workflow/operator profile and budget defaults.
- `rai workspaces`
  Show the workspace/workstream registry center.
- `rai hooks`
  Seed or inspect the disabled-by-default hooks surface.
- `rai mcp`
  Inspect the repo-local MCP manifest surface.
- `rai notify`
  Emit a notification smoke event.
- `rai daemon`
  Show or restart the optional daemon heartbeat.
- `rai gc`
  Prune old verifications, packet artifacts, and Codex control backups.
- `rai incident`
  Open or list incident memory entries.
- `rai fleet`
  Show the current repo operator-center summary.
- `rai sessions`
  Show workflow, quick, team, and handoff session status.
- `rai patch-review`
  Review collected patch bundles.
- `rai patch-apply`
  Apply a collected patch bundle with `git apply --3way`.
- `rai patch-rollback`
  Reverse an applied patch bundle with `git apply -R --3way`.
- `rai review`
  Run the multi-pass review engine and write `.workflow/reports/review.md` plus structured findings.
- `rai review-mode`
  Run the deep review engine explicitly.
- `rai review-orchestrate`
  Build package/persona/wave-based review orchestration for large repos and monorepos.
- `rai review-tasks`
  Convert review findings into a blocker-first four-wave task graph.
- `rai pr-review`
  Review a PR or diff-oriented surface with risk heatmap and blockers.
- `rai re-review`
  Replay the current diff against the latest review history.
- `rai ui-direction`
  Generate the taste-aware UI direction pack that Codex can implement against.
- `rai design-dna`
  Generate `docs/workflow/DESIGN-DNA.md` with external reference blend, product category, and anti-pattern bans.
- `rai page-blueprint`
  Generate `docs/workflow/PAGE-BLUEPRINT.md` with section map, proof surfaces, and page-type priorities.
- `rai design-md`
  Generate `docs/workflow/DESIGN.md` as a portable design contract and optional repo-root `DESIGN.md` mirror.
- `rai component-strategy`
  Generate `docs/workflow/COMPONENT-STRATEGY.md` with reuse/extract/build guidance for the current repo and target page family.
- `rai design-benchmark`
  Generate `docs/workflow/DESIGN-BENCHMARK.md` with differentiation plays and commodity-risk checks from the active reference blend.
- `rai state-atlas`
  Generate `docs/workflow/STATE-ATLAS.md` with required UX states and review hooks.
- `rai frontend-brief`
  Generate `docs/workflow/FRONTEND-BRIEF.md` as a one-shot pack for external-site frontend work.
- `rai ui-recipe`
  Generate `docs/workflow/UI-RECIPE.md` with a semantic prototype, stack scaffold, and translation notes.
- `rai ui-spec`
  Generate `docs/workflow/UI-SPEC.md`.
- `rai ui-plan`
  Generate `docs/workflow/UI-PLAN.md`.
- `rai ui-review`
  Generate `docs/workflow/UI-REVIEW.md` plus a frontend scorecard.
- `rai preview`
  Write `.workflow/runtime/preview-gallery.md` from browser artifacts.
- `rai component-map`
  Generate `docs/workflow/COMPONENT-INVENTORY.md`.
- `rai responsive-matrix`
  Generate `docs/workflow/RESPONSIVE-MATRIX.md`.
- `rai design-debt`
  Generate `docs/workflow/DESIGN-DEBT.md`.
- `rai monorepo`
  Generate package-aware monorepo execution, review shards, and verify guidance.
- `rai monorepo-mode`
  Run the staged large-monorepo analysis mode, sync the root `AGENTS.md` monorepo layer, and emit `REPO_MAP`, `REVIEW_SCOPE`, `PATCH_PLAN`, and a prompt-rich report.
- `rai ship-readiness`
  Score ship readiness from review, evidence, approvals, and verify-work results.
- `rai ship`
  Write `.workflow/reports/ship.md`.
- `rai pr-brief`
  Write `.workflow/reports/pr-brief.md`.
- `rai release-notes`
  Write `.workflow/reports/release-notes.md`.
- `rai session-report`
  Write `.workflow/reports/session-report.md`.
- `rai update`
  Refresh runtime files while preserving canonical markdown.
- `rai uninstall`
  Safely remove installed runtime surfaces.
- `rai benchmark`
  Run the hot-path benchmark harness.

## Quick mode

- `rai quick start --goal "..."`
- `rai quick`
- `rai quick close --summary "..."`
- `rai quick escalate --summary "..." --open-full-workflow`

## Team runtime

- `rai team`
- `rai team start --parallel --activation-text "..."`
- `rai team run --adapter worktree|subagent|hybrid --activation-text "parallel yap" --write-scope src,tests`
- `rai team dispatch`
- `rai team monitor`
- `rai team collect`
- `rai team supervise --cycles 3 --interval 5`
- `rai team watch --interval 5`
- `rai team conflicts`
- `rai team merge-queue --apply-next|--apply-all`
- `rai team quality`
- `rai team pr-feedback import --file review-comments.json`
- `rai team pr-feedback resolve --id comment-1`
- `rai team mailbox`
- `rai team timeline`
- `rai team steer --note "..."`
- `rai team status`
- `rai team stop --summary "..."`
- `rai team resume`
- `rai team advance`

## Runtime artifacts

- `rai launch` -> `.workflow/runtime/launch.json`
- `rai hud` -> `.workflow/runtime/hud.json`
- `rai manager` -> `.workflow/runtime/manager.json`
- `rai next-prompt` -> `.workflow/runtime/next-prompt.md`
- `rai verify-shell` -> `.workflow/verifications/shell/*`
- `rai verify-browser` -> `.workflow/verifications/browser/*`
- `rai verify-work` -> `.workflow/reports/verify-work.{md,json}`
- `rai packet` -> `.workflow/packets/*` and `.workflow/cache/packet-locks.json`
- `rai evidence` -> `.workflow/evidence-graph/latest.json`
- `rai ship-readiness` -> `.workflow/reports/ship-readiness.{md,json}`
- `rai review-orchestrate` -> `.workflow/reports/review-orchestration.{md,json}`
- `rai codex` -> `.workflow/runtime/codex-control/*` with a virtual repo-local `.codex` root
- `rai team mailbox` -> `.workflow/orchestration/runtime/mailbox.jsonl`
- `rai team timeline` -> `.workflow/orchestration/runtime/timeline.jsonl`
- `rai team supervise` / `rai team watch` -> `.workflow/orchestration/runtime/supervisor.json`
- `rai team conflicts` -> `.workflow/orchestration/runtime/conflicts.json`
- `rai team merge-queue` -> `.workflow/orchestration/runtime/merge-queue.json`
- `rai team quality` -> `.workflow/orchestration/runtime/quality.json`
- `rai team pr-feedback` -> `.workflow/orchestration/runtime/pr-feedback.json` plus `.workflow/orchestration/runtime/pr-feedback-followups.md`
- `rai team collect` -> `.workflow/orchestration/runtime/review-loop.{json,md}` plus `.workflow/orchestration/runtime/combined.patch`
- `rai patch-review` -> `.workflow/orchestration/patches/*`
- `rai route` -> `.workflow/cache/model-routing.json`
- `rai do` / `rai route` -> `.workflow/cache/intent-route-history.json`
- `rai dashboard` -> `.workflow/runtime/dashboard/{index.html,state.json}`
- `rai monorepo` -> `.workflow/cache/monorepo-intelligence.json` plus `docs/workflow/MONOREPO.md`
- `rai monorepo-mode` -> `.workflow/reports/monorepo-mode.{md,json}` plus `AGENTS.md`, `docs/workflow/REPO_MAP.md`, `docs/workflow/REVIEW_SCOPE.md`, and `docs/workflow/PATCH_PLAN.md`
- `rai ui-direction` -> `.workflow/runtime/ui-direction.json` plus `docs/workflow/UI-DIRECTION.md`
- `rai design-dna` -> `.workflow/runtime/design-dna.json` plus `docs/workflow/DESIGN-DNA.md`
- `rai page-blueprint` -> `.workflow/runtime/page-blueprint.json` plus `docs/workflow/PAGE-BLUEPRINT.md`
- `rai design-md` -> `.workflow/runtime/design-md.json` plus `docs/workflow/DESIGN.md`
- `rai component-strategy` -> `.workflow/runtime/component-strategy.json` plus `docs/workflow/COMPONENT-STRATEGY.md`
- `rai design-benchmark` -> `.workflow/runtime/design-benchmark.json` plus `docs/workflow/DESIGN-BENCHMARK.md`
- `rai state-atlas` -> `.workflow/runtime/state-atlas.json` plus `docs/workflow/STATE-ATLAS.md`
- `rai frontend-brief` -> `.workflow/runtime/frontend-brief.json` plus `docs/workflow/FRONTEND-BRIEF.md`
- `rai ui-recipe` -> `.workflow/runtime/ui-recipe.json` plus `docs/workflow/UI-RECIPE.md`
- `rai ui-spec` -> `docs/workflow/UI-SPEC.md`
- `rai ui-plan` -> `docs/workflow/UI-PLAN.md`
- `rai ui-review` -> `docs/workflow/UI-REVIEW.md`
- `rai component-map` -> `docs/workflow/COMPONENT-INVENTORY.md`
- `rai responsive-matrix` -> `docs/workflow/RESPONSIVE-MATRIX.md`
- `rai design-debt` -> `docs/workflow/DESIGN-DEBT.md`
- `rai policy` / `rai approvals` -> canonical `docs/workflow/POLICY.md` plus derived `.workflow/runtime/policy.json` and `.workflow/runtime/approvals.json`
- `rai discuss` -> `.workflow/runtime/discuss.{json,md}`
- `rai codex promptpack` -> `.workflow/runtime/codex-control/promptpack.{md,json}`

## Backward-compatible scripts

Fresh `rai setup` installs the focused `pilot` profile by default so package.json and the repo-local shell stay smaller on day one. Use `rai update --script-profile core` for the full shell with curated npm aliases, or `rai update --script-profile full` when you want the full `raiola:*` fallback surface restored.

- `npm run raiola:launch`
- `npm run raiola:codex`
- `npm run raiola:do`
- `npm run raiola:note`
- `npm run raiola:thread`
- `npm run raiola:backlog`
- `npm run raiola:manager`
- `npm run raiola:dashboard`
- `npm run raiola:setup`
- `npm run raiola:init`
- `npm run raiola:hud`
- `npm run raiola:next`
- `npm run raiola:doctor`
- `npm run raiola:health`
- `npm run raiola:discuss`
- `npm run raiola:repair`
- `npm run raiola:questions`
- `npm run raiola:assumptions`
- `npm run raiola:claims`
- `npm run raiola:secure`
- `npm run raiola:explore`
- `npm run raiola:verify-shell`
- `npm run raiola:verify-browser`
- `npm run raiola:verify-work`
- `npm run raiola:packet-os`
- `npm run raiola:evidence`
- `npm run raiola:validation-map`
- `npm run raiola:next-prompt`
- `npm run raiola:route`
- `npm run raiola:stats`
- `npm run raiola:profile`
- `npm run raiola:workspaces`
- `npm run raiola:checkpoint`
- `npm run raiola:quick`
- `npm run raiola:team`
- `npm run raiola:team-runtime`
- `npm run raiola:subagents`
- `npm run raiola:policy`
- `npm run raiola:approval`
- `npm run raiola:approvals`
- `npm run raiola:hooks`
- `npm run raiola:mcp`
- `npm run raiola:notify`
- `npm run raiola:daemon`
- `npm run raiola:gc`
- `npm run raiola:incident`
- `npm run raiola:fleet`
- `npm run raiola:sessions`
- `npm run raiola:patch-review`
- `npm run raiola:patch-apply`
- `npm run raiola:patch-rollback`
- `npm run raiola:review`
- `npm run raiola:review-mode`
- `npm run raiola:monorepo-mode`
- `npm run raiola:review-orchestrate`
- `npm run raiola:pr-review`
- `npm run raiola:re-review`
- `npm run raiola:ui-direction`
- `npm run raiola:design-dna`
- `npm run raiola:page-blueprint`
- `npm run raiola:design-md`
- `npm run raiola:component-strategy`
- `npm run raiola:design-benchmark`
- `npm run raiola:state-atlas`
- `npm run raiola:frontend-brief`
- `npm run raiola:ui-recipe`
- `npm run raiola:ui-spec`
- `npm run raiola:ui-plan`
- `npm run raiola:ui-review`
- `npm run raiola:preview`
- `npm run raiola:component-map`
- `npm run raiola:responsive-matrix`
- `npm run raiola:design-debt`
- `npm run raiola:monorepo`
- `npm run raiola:ship-readiness`
- `npm run raiola:ship`
- `npm run raiola:pr-brief`
- `npm run raiola:release-notes`
- `npm run raiola:session-report`
- `npm run raiola:update`
- `npm run raiola:uninstall`
- `npm run raiola:benchmark`

## Command mapping examples

- `rai launch` -> `npm run raiola:launch`
- `rai codex` -> `npm run raiola:codex`
- `rai do` -> `npm run raiola:do -- "..." `
- `rai note` -> `npm run raiola:note -- "..." `
- `rai manager` -> `npm run raiola:manager`
- `rai doctor` -> `npm run raiola:doctor -- --strict`
- `rai health` -> `npm run raiola:health -- --strict`
- `rai hud` -> `npm run raiola:hud -- --compact`
- `rai next` -> `npm run raiola:next`
- `rai explore` -> `npm run raiola:explore -- "query"`
- `rai verify-shell` -> `npm run raiola:verify-shell -- --cmd "npm test"`
- `rai verify-browser` -> `npm run raiola:verify-browser -- --url http://localhost:3000`
- `rai packet` -> `npm run raiola:packet-os -- compile --step plan`
- `rai checkpoint` -> `npm run raiola:checkpoint -- --next "Resume here"`
- `rai review-orchestrate` -> `npm run raiola:review-orchestrate`
- `rai ui-direction` -> `npm run raiola:ui-direction`
- `rai design-dna` -> `npm run raiola:design-dna`
- `rai page-blueprint` -> `npm run raiola:page-blueprint`
- `rai design-md` -> `npm run raiola:design-md`
- `rai component-strategy` -> `npm run raiola:component-strategy`
- `rai design-benchmark` -> `npm run raiola:design-benchmark`
- `rai state-atlas` -> `npm run raiola:state-atlas`
- `rai frontend-brief` -> `npm run raiola:frontend-brief`
- `rai ui-recipe` -> `npm run raiola:ui-recipe`
- `rai ui-spec` -> `npm run raiola:ui-spec`
- `rai ui-review` -> `npm run raiola:ui-review -- --url ./preview.html`
- `rai monorepo` -> `npm run raiola:monorepo`
- `rai codex promptpack` -> `npm run raiola:codex -- promptpack --goal "review the diff"`
- `rai ship-readiness` -> `npm run raiola:ship-readiness`
