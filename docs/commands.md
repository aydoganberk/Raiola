# Commands

Use `rai help` for the starter flows, `rai help <topic>` for focused categories, and `rai help all` for the full shell.

`rai` is the primary shell. `raiola-on` is the first-run onboarding entry, and `raiola:*` is the repo-local npm fallback namespace.

## Lifecycle facade

- `rai spec`
  Define the next slice before coding.
- `rai plan`
  Turn the active slice into chunks and validation gates.
- `rai build`
  Translate the active plan into the next safe execution step.
- `rai test`
  Show the verification path that proves the slice works.
- `rai simplify`
  Simplify code without changing behavior.
- `rai review`
  Generate a review-ready package.
- `rai ship`
  Generate a ship-ready package.

## Primary verbs

- `rai on`
  Open Raiola onboarding. `rai on next` is the clean blank-state entry and proposes a milestone to start.
- `rai launch`
  Strong-start launcher that recommends the lane, first command, and minimal resume prompt.
- `rai start`
  Open the productized workflow bundle layer. This groups overlapping commands into one structured entry and writes `.workflow/runtime/start-plan.{json,md}`. Use `rai help bundles` to browse bundle families, `rai start recommend --goal "..."` to let the harness choose bundle/profile/add-ons, `rai start <bundle> --goal "..."` to pin a bundle explicitly, and `--profile speed|balanced|deep` to control bundle depth. Add-ons now include `trust|docs|handoff|parallel|browser|surface|design-system|state|ownership|regression|shard|repair|recommended`, so code review, code audit, repo review, large-repo review, frontend work, and correction waves can widen without leaving the start command.
- `rai codex`
  Safe Codex control plane. Supports `setup`, `doctor`, `diff-config`, `rollback`, `sync`, role scaffolding, skill install/remove, `profile suggest`, `bootstrap`, `resume-card`, `promptpack`, and `plan-subagents`.
- `rai do`
  Route a natural-language intent into `quick`, `full`, `review`, `frontend`, or `team` lanes with explainable capability and verify plans. English/Turkish persona framing and nearby typos are tolerated on the routing path.
- `rai audit`
  Intent-level audit facade that resolves broad repo audit, diff review, monorepo review, and correction-aware review work into the right deeper lane.
- `rai fix`
  Intent-level correction facade that turns findings and review output into the next bounded fix wave and syncs the shared review-correction control plane.
- `rai note`
  Capture a runtime inbox note and optionally promote it into backlog, thread, or seeds.
- `rai thread`
  Open, list, and resume named thread docs under `docs/workflow/THREADS/`.
- `rai backlog`
  Add and review canonical backlog items.
- `rai manager`
  Single-screen operator view with health, next route, team runtime, verify queue, and repair hints.
- `rai dashboard`
  Generate `.workflow/runtime/dashboard/index.html`, a local HTML operator surface with command palette, context compiler, route/review/frontend boards, screenshot state, review-correction panels such as Review Control Room, Correction Board, and Large Repo Board, plus release-control panels such as Verify Status Board and Ship Readiness Board. The dashboard now also renders the Operating Center, Repo Config, Trust Center, Change Control, Autopilot, Handoff OS, Team Control Room, Measurement / ROI, Explainability, and Lifecycle Center. `--refresh-planes` refreshes the unified operating-center surface first.
- `rai operate`
  Open the unified engineering operating center, rank the current control planes, show the active question, and preserve publish/readiness context in one entry.
- `rai repo-config`
  Detect stack packs, write `.workflow/repo-config.json`, and publish repo-native defaults for bundle selection, trust level, required verifications, handoff standard, automation, and external exports.
- `rai repo-control`
  Open `.workflow/reports/repo-control-room.{json,md}` with package graph ranking, workspace posture, repo hotspots, and Codex follow-through guidance.
- `rai workspace-impact`
  Open `.workflow/reports/workspace-impact.{json,md}` with changed/impacted package mapping, blast radius, development waves, and verification order for the current monorepo slice.
- `rai monorepo-control`
  Open `.workflow/reports/monorepo-control-room.{json,md}` with dependency hubs, workspace coordination, impact waves, and Codex follow-through for large monorepos.
- `rai frontend-control`
  Open `.workflow/reports/frontend-control-room.{json,md}` with framework/routing detection, browser evidence, missing states, design debt, and scorecard posture.
- `rai safety-control`
  Open `.workflow/reports/safety-control-room.{json,md}` with secure-phase findings, failure forecasts, self-healing repair actions, and verification exposure.
- `rai trust`
  Open Trust Center and answer whether the current work is safe to start, merge, and ship.
- `rai release-control`
  Open Change Control, combine trust/release signals, materialize the supporting ship surfaces, refresh closeout artifacts, and export GitHub/CI/Slack/issue-tracker-friendly status files.
- `rai control-plane-publish`
  Regenerate the GitHub / CI / Slack bridge exports from the current Change Control artifact, keeping repo-status/export-manifest paths stable, and optionally append them to GitHub Actions environment files.
- `rai autopilot`
  Build the routine automation layer: morning summary, branch-aware start, correction-lane recovery, drift alerts, and inactive-thread recovery.
- `rai handoff`
  Publish the Handoff OS with compact handoff, PR brief, session report, open decisions, unresolved risks, resume anchor, and a machine-readable continuity bundle.
- `rai team-control`
  Open the multi-agent Team Control Room with ownership, parallel lanes, merge queue visibility, mailbox/timeline activity, handoff queue, conflicts, quality, and escalation hints.
- `rai measure`
  Publish findings/closure/verification ROI metrics, export coverage, continuity/team activity, history, and trend deltas.
- `rai explain`
  Explain why a lane and bundle were chosen, which signals mattered, which surfaces were or were not surveyed, how confidence breaks down, and what deep mode would add.
- `rai lifecycle`
  Unify installation, upgrade drift, repo-config drift, export drift, doctor, health, self-healing, and rollback hints in one lifecycle surface.
- `rai setup`
  Install or refresh the workflow product in the current repo.
- `rai init`
  Bootstrap workflow control-plane files in the current repo.
- `rai milestone`
  Open a new full-workflow milestone.
- `rai milestone-edit`
  Rename or reshape the active milestone without hand-patching the canonical docs.
- `rai doctor`
  Verify install/runtime integrity and host prerequisites. Use `--repair` for a dry-run self-heal plan.
- `rai health`
  Verify blocking workflow/runtime health. Host-tool advisories stay in `doctor`. Use `--repair` for a dry-run self-heal plan.
- `rai spec`
  Thin facade for the define/spec stage.
- `rai plan`
  Thin facade for the planning stage.
- `rai build`
  Thin facade for the execution stage.
- `rai test`
  Thin facade for the verification stage.
- `rai simplify`
  Thin facade for behavior-preserving cleanup.
- `rai discuss`
  Generate a discuss brief from current workflow state, open questions, and active assumptions. In `proposal_first` mode it first emits 2-3 options and waits for an approved choice before deepening the packet.
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
  Run smoke browser verification or real Playwright proof. When the target repo has `playwright` or `@playwright/test` installed, `--adapter auto --require-proof` captures a real screenshot and accessibility tree.
- `rai api-surface`
  Scan backend routes, middleware chains, auth signals, and data-store surfaces for API-heavy repositories or external local snapshots.
- `rai verify-work`
  Run the trust-layer verification pass, summarize gaps, sync the shared findings/status model, and emit a release-control verify board when needed.
- `rai packet`
  Compile, explain, lock, diff, sync, and verify role-aware packets.
- `rai evidence`
  Build the repo-local evidence graph from claims, verifications, and touched files.
- `rai validation-map`
  Roadmap-compatible wrapper for the validation contract surface.
- `rai checkpoint`
  Write a continuity checkpoint.
- `rai telemetry`
  Inspect routing telemetry and capture route-feedback outcomes.
- `rai next-prompt`
  Generate a minimal or full resume prompt for the next session.
- `rai repair`
  Generate or apply the bounded self-healing repair plan for runtime drift and corrupt workflow state.
- `rai quick`
  Start, inspect, close, or escalate quick mode.
- `rai team`
  Plan or operate Team Lite orchestration and the adapter runtime.
- `rai supervisor`
  Run the runtime supervisor and terminal control room.
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
- `rai workspace-impact`
  Generate the current changed/impacted workspace map, blast radius, development waves, and verification queue for the active monorepo slice.
- `rai hooks`
  Enable, disable, validate, or inspect the disabled-by-default hooks surface.
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
  Run the multi-pass review engine and write `.workflow/reports/review.md` plus structured findings, the shared findings registry, and correction-control artifacts.
- `rai review-mode`
  Run the deep review engine explicitly and keep the review-correction control plane synchronized.
- `rai audit-repo`
  Run the explicit repo-wide audit surface when you want a broad codebase scan without intent routing, ranked packages, and correction-wave planning.
- `rai repo-proof`
  Generate a compact proof pack for the current repo or an external local snapshot so repo truth, API surface, frontend readiness, and audit health land in one pass.
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
  Generate `docs/workflow/FRONTEND-BRIEF.md` as the full frontend artifact pack; prefer `map-frontend` + `ui-direction` + `ui-spec` for the lean path.
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
- `rai monorepo-control`
  Generate the large-monorepo control room with dependency hubs, impact waves, workspace coordination, and verification sequencing.
- `rai monorepo-mode`
  Run the staged large-monorepo analysis mode, sync the root `AGENTS.md` monorepo layer, emit `REPO_MAP`, `REVIEW_SCOPE`, `PATCH_PLAN`, and keep the large-repo board and correction planner synchronized.
- `rai ship-readiness`
  Score ship readiness from review, evidence, approvals, and verify-work results, then publish the release-control ship board.
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
- `rai team merge-queue --apply-next|--apply-all` (validated worktree handoff; queued paths are verified in a fresh worktree and then exact file outputs are materialized)
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

- `rai spec` -> `.workflow/reports/spec-guide.md`
- `rai plan` -> `.workflow/reports/plan-guide.md`
- `rai build` -> `.workflow/reports/build-guide.md`
- `rai test` -> `.workflow/reports/test-guide.md`
- `rai simplify` -> `.workflow/reports/simplify-guide.md`
- `rai launch` -> `.workflow/runtime/launch.json`
- `rai api-surface` -> `.workflow/runtime/api-surface.{json,md}` plus `.workflow/reports/api-surface.{json,md}` when write mode is enabled
- `rai start` -> `.workflow/runtime/start-plan.{json,md}` including selected bundle, profile, add-ons, candidate bundles, operator tips, and the structured phase plan
- `rai operate` -> `.workflow/reports/operating-center.{json,md}` plus `.workflow/runtime/operating-center.{json,md}`
- `rai repo-config` -> `.workflow/repo-config.json` plus `.workflow/runtime/repo-config.{json,md}`
- `rai trust` -> `.workflow/reports/trust-center.{json,md}` plus `.workflow/runtime/trust-center.{json,md}`
- `rai release-control` -> `.workflow/reports/change-control.{json,md}`, refreshed closeout docs, and `.workflow/exports/{github-pr-comment.{md,json},github-check-summary.{md,json},github-actions-step-summary.md,github-actions-output.json,ci-gate.json,repo-status.json,status-badge.json,issue-tracker.json,slack-summary.{txt,json},export-manifest.json,control-plane-packet.json}`
- `rai control-plane-publish` -> refresh `.workflow/exports/*` from the latest change-control artifact, including `control-plane-packet.json`, and optionally append summaries / outputs to GitHub Actions env files
- `rai autopilot` -> `.workflow/reports/autopilot.{json,md}` plus `.workflow/runtime/autopilot.{json,md}`
- `rai handoff` -> `.workflow/reports/handoff-os.{json,md}` plus `.workflow/reports/{handoff-compact.md,continuity-bundle.json}` with linked trust/release/explainability decision basis and runtime mirrors
- `rai team-control` -> `.workflow/reports/team-control-room.{json,md}` plus runtime mirrors
- `rai supervisor` -> `.workflow/orchestration/runtime/supervisor.json`
- `rai measure` -> `.workflow/reports/measurement.{json,md}` plus `.workflow/reports/measurement-history.json` and control-plane integrity metrics
- `rai explain` -> `.workflow/reports/explainability.{json,md}` plus runtime mirrors
- `rai lifecycle` -> `.workflow/reports/lifecycle-center.{json,md}` plus runtime mirrors
- `rai repair` -> `.workflow/runtime/repair-plan.json` when a bounded repair plan is generated
- `rai review` / `rai review-mode` / `rai audit-repo` / `rai monorepo-mode` / `rai fix` -> `.workflow/reports/findings-registry.json` plus `.workflow/reports/correction-control.{json,md}` when the review-correction control plane is active
- `rai hud` -> `.workflow/runtime/hud.json`
- `rai manager` -> `.workflow/runtime/manager.json`
- `rai telemetry` -> `.workflow/runtime/telemetry.json`
- `rai next-prompt` -> `.workflow/runtime/next-prompt.md`
- `rai verify-shell` -> `.workflow/verifications/shell/*`
- `rai verify-browser` -> `.workflow/verifications/browser/*`
- `rai verify-work` -> `.workflow/reports/verify-work.{md,json}` plus `.workflow/reports/release-control.{md,json}`
- `rai packet` -> `.workflow/packets/*` and `.workflow/cache/packet-locks.json`
- `rai evidence` -> `.workflow/evidence-graph/latest.json`
- `rai ship-readiness` -> `.workflow/reports/ship-readiness.{md,json}` plus `.workflow/reports/release-control.{md,json}`
- `rai review-orchestrate` -> `.workflow/reports/review-orchestration.{md,json}`
- `rai codex` -> native `.codex/*` plus backup journal and rollback metadata under `.workflow/runtime/codex-control/*`
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
- `rai codex promptpack` -> `.workflow/runtime/codex-control/promptpack.{md,json}` together with native `.codex/` profiles, hooks, and subagent context

## Backward-compatible scripts

Fresh `rai setup` installs the focused `pilot` profile by default so package.json and the repo-local shell stay smaller on day one. The source package also keeps a compact npm script surface.

Use the universal npm entry everywhere:

- `npm run rai -- help quickstart`
- `npm run rai -- start --goal "land the next safe slice"`
- `npm run rai -- repo-proof -- --repo ../candidate-repo --json`
- `npm run rai -- verify --goal "ship readiness kontrolu"`

When you explicitly want repo-local fallback aliases inside an installed repository, upgrade the install surface:

- `rai update --script-profile core`
- `rai update --script-profile full`

The `full` profile restores the `raiola:*` compatibility namespace from `runtime_script_catalog.js`, so older automation and notes can keep working without forcing the source package itself to carry a giant npm script catalog.

## Command mapping examples

- `rai launch` -> `npm run rai -- launch`
- `rai codex` -> `npm run rai -- codex`
- `rai do "..."` -> `npm run rai -- do "..."`
- `rai doctor --strict` -> `npm run rai -- doctor --strict`
- `rai verify-shell --cmd "npm test"` -> `npm run rai -- verify-shell --cmd "npm test"`
- `rai repo-proof --repo ../candidate-repo --json` -> `npm run rai -- repo-proof -- --repo ../candidate-repo --json`
- `rai start recommend --goal "ship the premium dashboard surface"` -> `npm run rai -- start recommend --goal "ship the premium dashboard surface"`
- `rai start frontend-ship --goal "run UI release signoff with browser proof" --with recommended` -> `npm run rai -- start frontend-ship --goal "run UI release signoff with browser proof" --with recommended`
- `rai ship-readiness` -> `npm run rai -- ship-readiness`

### Codex operator extras

- `rai codex operator --goal "..."`
  Build a native Codex operator packet with repo-local `CODEX_HOME`, profile, slash flow, subagent recommendations, app-server/MCP entrypoints, and automation/worktree posture.
- `rai codex cockpit --goal "..." --json`
  Materialize a runnable launch kit with launcher scripts, prompt/context packs, resume files, and an explicit preferred entrypoint.
- `rai codex telemetry --json`
  Summarize native hook telemetry so warnings, denials, interruptions, and user steering become a reusable operator signal.
- `rai codex managed-export --json`
  Export a Trust-aware `requirements.toml` template for managed Codex deployment.
