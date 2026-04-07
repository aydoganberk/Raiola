# Architecture

## Canonical state

The product keeps markdown canonical.

Full workflow canonical files live under `docs/workflow/` or the active named workstream root.

That canonical set now includes governance surfaces such as `docs/workflow/POLICY.md`; runtime mirrors remain derived state only.

Frontend OS canonical files now include `docs/workflow/UI-DIRECTION.md`, `DESIGN-DNA.md`, `STATE-ATLAS.md`, `PAGE-BLUEPRINT.md`, `DESIGN.md`, `COMPONENT-STRATEGY.md`, `DESIGN-BENCHMARK.md`, `FRONTEND-BRIEF.md`, `UI-SPEC.md`, `UI-PLAN.md`, `UI-REVIEW.md`, `RESPONSIVE-MATRIX.md`, `COMPONENT-INVENTORY.md`, and `DESIGN-DEBT.md`.

Quick mode canonical files live under `.workflow/quick/*.md`.

Team Lite orchestration canonical files live under `.workflow/orchestration/PLAN.md`, `STATUS.md`, `WAVES.md`, and `RESULTS.md`.

## Non-canonical runtime state

These surfaces are cache, index, telemetry, verification, or operator helpers only:

- `.workflow/state.json`
- `.workflow/runtime/*.json`
- `.workflow/runtime/*.md`
- `.workflow/packet-state.json`
- `.workflow/VERSION.md`
- `.workflow/product-manifest.json`
- `.workflow/quick/session.json`
- `.workflow/orchestration/state.json`
- `.workflow/orchestration/runtime/*.json`
- `.workflow/cache/*`
- `.workflow/fs-index.json`
- `.workflow/verifications/*`

Deleting them may reduce performance or resume convenience, but it must not break workflow semantics.

`cwf update` uses `.workflow/VERSION.md` as the visible product-version marker for migrate and refresh decisions.

## Control-plane layers

- `cwf` is the product shell.
- installed repos also get `bin/cwf.js` and `scripts/cli/cwf.js` as a repo-local CLI fallback.
- `workflow:*` scripts remain backward-compatible.
- `common.js` is still the facade for legacy callers.
- newer modules in `scripts/workflow/io`, `markdown`, `packet`, and `perf` take over hot-path responsibilities incrementally.
- `runtime_collector.js` is the shared in-process collector for `launch`, `hud`, `manager`, and the resume prompt surface.
- `repair.js` separates safe runtime fixes from manual canonical follow-up.
- `team_runtime.js` adds adapter-backed dispatch/monitor/collect plus a bounded concurrent supervisor, merge-aware execution queue, PR feedback ingest, and review-loop artifacts on top of the canonical orchestration contract.
- `codex_control.js` adds the safe Codex control-plane layer with diff, journal, rollback, and repo-derived role generation.
- `do.js`, `note.js`, `thread.js`, and `backlog.js` add the daily intent/capture surfaces.
- `capability_registry.js`, `intent_engine.js`, `intent_lexicon.js`, and `codex_profile_engine.js` add the explainable capability graph, multilingual intent grounding, steering memory, deterministic command matches, and task-aware Codex profile selection.
- `dashboard.js` turns the file-based runtime into a local HTML control room with command palette, context compiler, route/review/frontend boards, and screenshot state.
- `questions.js`, `claims.js`, `secure_phase.js`, `packet.js`, and `evidence.js` add the trust, packet-lock, and provenance layer.
- `policy.js`, `approvals.js`, `hooks.js`, `mcp.js`, `notify.js`, `daemon.js`, `gc.js`, `incident.js`, `fleet.js`, and `sessions.js` add the governance, integration, scale, and operator-center layer.
- `symbol_graph.js` plus the richer `daemon.js` move Scale OS beyond file lists into persistent symbol/import graphs and refreshable cache summaries.
- `review_engine.js` and `review_findings.js` add the multi-pass Review OS with findings, heatmap, blockers, replay, and patch suggestions.
- `review_semantic.js` deepens Review OS with exported-surface, auth-guard, error-path, and frontend semantic analysis on top of raw diff heuristics.
- `review_orchestration.js` turns review output into package-aware, persona-aware, wave-based execution plans for large repos and monorepos.
- `frontend_os.js`, `design_intelligence.js`, `design_contracts.js`, `frontend_briefs.js`, `frontend_strategy.js`, `ui_direction.js`, `design_dna.js`, `page_blueprint.js`, `design_md.js`, `component_strategy.js`, `design_benchmark.js`, `state_atlas.js`, `frontend_brief.js`, `ui_spec.js`, `ui_plan.js`, `ui_review.js`, `component_inventory.js`, `responsive_matrix.js`, `design_debt.js`, and `preview.js` add the Frontend OS surface plus taste-aware direction generation.
- `package_graph.js`, `monorepo.js`, and `.workflowignore`-aware `fs_index.js` add the Scale OS package graph, impacted-test visibility, review shard planning, verify planning, and denylist layer.
- `policy.js` and `approvals.js` treat `docs/workflow/POLICY.md` as the source of truth and keep `.workflow/runtime/policy.json` plus `.workflow/runtime/approvals.json` in sync as derived mirrors.
- `cwf doctor` audits both canonical workflow health and install-surface integrity, including package scripts, runtime files, skill installation, and the visible version marker.

## Workflow lanes

- Full workflow: milestone lifecycle with plan and audit gates.
- Quick mode: lighter artifact set for narrow tasks.
- Team Lite: explicit parallel routing with disjoint write-scope safety.
- Lifecycle closeout: review, ship, PR brief, release notes, session report.

## Runtime companion layer

- `cwf launch` and `cwf codex` provide strong-start orientation.
- `cwf codex` also manages the virtual `.codex` surface via the repo-local safe mirror under `.workflow/runtime/codex-control/`.
- `cwf manager` and `cwf hud --watch` provide live operator visibility.
- `cwf explore`, `cwf verify-shell`, and `cwf verify-browser` provide purpose-built exploration and evidence capture.
- `cwf route`, `cwf stats`, `cwf profile`, and `cwf workspaces` provide operator routing, telemetry, and workspace center surfaces.
- `cwf route --why` and `cwf do --explain` now expose rejected alternatives, ambiguity class, and language-mix grounding for the chosen lane.
- `cwf packet explain` now emits a compiler summary that condenses route, scope, risks, questions, claims, impacted packages/tests, and evidence slots into a task-aware context packet.
- `cwf route replay`, `cwf route eval`, `cwf codex bootstrap`, `cwf codex promptpack`, and `cwf codex resume-card` extend the operator surface from phase-only routing into task-aware bootstrap packets, prompt packs, and resume cards.
- `cwf team mailbox`, `cwf team timeline`, `cwf team supervise`, `cwf team merge-queue`, and `cwf patch-review` expose runtime collect/merge/review state directly in-product.
- `cwf monorepo` materializes package-aware write scopes, verify plans, and performance risk notes under both docs and runtime cache surfaces.
- `cwf review-orchestrate` materializes package/persona/wave review plans that can feed Team Lite, subagents, or Codex plan-subagents.
- `cwf verify-browser` and `cwf ui-review` now carry browser-level accessibility and journey audits alongside visual evidence.
- `cwf ui-direction` gives frontend lanes a taste-aware target before UI spec and plan generation starts.
