# Architecture

## Canonical state

The product keeps markdown canonical.

Full workflow canonical files live under `docs/workflow/` or the active named workstream root.

That canonical set now includes governance surfaces such as `docs/workflow/POLICY.md`; runtime mirrors remain derived state only.

Frontend OS canonical files now include `docs/workflow/UI-DIRECTION.md`, `DESIGN-DNA.md`, `STATE-ATLAS.md`, `PAGE-BLUEPRINT.md`, `DESIGN.md`, `COMPONENT-STRATEGY.md`, `DESIGN-BENCHMARK.md`, `FRONTEND-BRIEF.md`, `UI-SPEC.md`, `UI-PLAN.md`, `UI-REVIEW.md`, `RESPONSIVE-MATRIX.md`, `COMPONENT-INVENTORY.md`, and `DESIGN-DEBT.md`.

Quick mode canonical files live under `.workflow/quick/*.md`.

Team Lite orchestration canonical files live under `.workflow/orchestration/PLAN.md`, `STATUS.md`, `WAVES.md`, and `RESULTS.md`.

Workspace and ownership truth is now repo-truth-first. `scripts/workflow/repo_truth.js` derives workspace, ecosystem, and ownership signals from package manifests, workspace configs, and `CODEOWNERS`; `docs/workflow/WORKSTREAMS.md` remains an operator overlay for active-root routing and handoff context rather than the sole package/workspace source of truth.

## Non-canonical runtime state

These surfaces are cache, index, telemetry, verification, or operator helpers only:

- `.workflow/state.json`
- `.workflow/runtime/*.json`
- `.workflow/runtime/*.md`
- `.workflow/runtime/start-plan.json`
- `.workflow/runtime/start-plan.md`
- `.workflow/packet-state.json`
- `.workflow/VERSION.md`
- `.workflow/product-manifest.json`
- `.workflow/quick/session.json`
- `.workflow/orchestration/state.json`
- `.workflow/orchestration/runtime/*.json`
- `.workflow/cache/*`
- `.workflow/fs-index.json`
- `.workflow/verifications/*`
- `.workflow/product-manifest.json` also records install metadata such as script profile, runtime surface profile, installer source root, runtime file inventory, and recommended gitignore entries for doctor/repair parity checks.

Source and installed repos should treat `.workflow/*` as local runtime by default. Commit canonical workflow docs and stable exported examples when they add value; keep cache, telemetry, and derived runtime state gitignored or easy to regenerate.

Source archives should also avoid carrying runtime sprawl by default. `.gitattributes` now marks `.workflow` with `export-ignore` so archive-style exports do not bundle cache, telemetry, and generated mirrors unless a repo intentionally overrides that rule.

Deleting them may reduce performance or resume convenience, but it must not break workflow semantics.

`rai update` uses `.workflow/VERSION.md` as the visible product-version marker for migrate and refresh decisions.

## Control-plane layers

- `rai` is the product shell.
- installed repos also get `bin/rai.js` and `scripts/cli/rai.js` as a repo-local CLI fallback.
- The source package keeps a compact npm script surface, while `runtime_script_catalog.js` preserves backward-compatible `raiola:*` fallbacks for installed repos.
- `common.js` is still the facade for legacy callers.
- newer modules in `scripts/workflow/io`, `markdown`, `packet`, and `perf` take over hot-path responsibilities incrementally.
- `runtime_collector.js` is the shared in-process collector for `launch`, `hud`, `manager`, and the resume prompt surface.
- `repair.js` separates safe runtime fixes from manual canonical follow-up.
- `team_runtime.js` adds adapter-backed dispatch/monitor/collect plus a bounded concurrent supervisor, merge-aware execution queue, PR feedback ingest, and review-loop artifacts on top of the canonical orchestration contract.
- `codex_control.js` adds the safe Codex control-plane layer with diff, journal, rollback, and repo-derived role generation.
- `do.js`, `note.js`, `thread.js`, and `backlog.js` add the daily intent/capture surfaces.
- `start.js` plus `workflow_bundle_catalog.js` and `workflow_bundles.js` add the productized bundle layer over the deeper command surface, including explicit bundle catalogs, grouped command families, and structured start plans for normal repos, large repos, frontend delivery, frontend review, frontend refactor, frontend polish, frontend ship-readiness, and release closeout.
- `capability_registry.js`, `intent_engine.js`, `intent_lexicon.js`, and `codex_profile_engine.js` add the explainable capability graph, multilingual intent grounding, steering memory, deterministic command matches, and task-aware Codex profile selection.
- `workflow_bundle_catalog.js`, `workflow_start_intelligence.js`, and `workflow_bundles.js` form the productized start layer that scores bundle candidates, selects start profiles, applies add-on overlays, and writes reusable structured plans for dashboard/help/do surfaces.
- `dashboard.js` turns the file-based runtime into a local HTML control room with command palette, context compiler, route/review/frontend boards, screenshot state, and a frontend control-room summary. The start-plan runtime mirrors let the dashboard surface the currently selected workflow bundle, its starter command, grouped command families, phased execution plan, and frontend lane metadata.
- `questions.js`, `claims.js`, `secure_phase.js`, `packet.js`, and `evidence.js` add the trust, packet-lock, and provenance layer.
- `policy.js`, `approvals.js`, `hooks.js`, `mcp.js`, `notify.js`, `daemon.js`, `gc.js`, `incident.js`, `fleet.js`, and `sessions.js` add the governance, integration, scale, and operator-center layer.
- `symbol_graph.js` plus the richer `daemon.js` move Scale OS beyond file lists into persistent symbol/import graphs and refreshable cache summaries.
- `review_engine.js` and `review_findings.js` add the multi-pass Review OS with findings, heatmap, blockers, replay, and patch suggestions.
- `review_semantic.js` deepens Review OS with exported-surface, auth-guard, error-path, and frontend semantic analysis on top of raw diff heuristics.
- `review_orchestration.js` turns review output into package-aware, persona-aware, wave-based execution plans for large repos and monorepos.
- `frontend_os.js`, `design_intelligence.js`, `design_contracts.js`, `frontend_briefs.js`, `frontend_strategy.js`, `ui_direction.js`, `design_dna.js`, `page_blueprint.js`, `design_md.js`, `component_strategy.js`, `design_benchmark.js`, `state_atlas.js`, `frontend_brief.js`, `ui_spec.js`, `ui_plan.js`, `ui_review.js`, `component_inventory.js`, `responsive_matrix.js`, `design_debt.js`, and `preview.js` add the Frontend OS surface plus taste-aware direction generation. `map_frontend.js` now also emits routing, surface inventory, planning signals, and recommended command packs so frontend identification feeds planning and bundle selection directly, including nested Next.js web packages and Expo/React Native mobile packages inside raw monorepos that have not yet been fully workflow-scaffolded.
- `repo_truth.js`, `package_graph.js`, `workspace_impact.js`, and `.workflowignore`-aware `fs_index.js` add the Scale OS repo-truth layer: workspace discovery, ecosystem markers, ownership overlays, impacted-test visibility, review shard planning, verify planning, and denylist handling sourced from package manifests, workspace configs, and `CODEOWNERS` before human overlays are applied. `api_surface.js` extends that same repo-truth layer into backend territory by surfacing route, middleware, auth, repository-pattern, and data-store signals for Hono/Express-style packages so package-aware verify contracts are not browser-only by default.
- `import_graph.js` intentionally stays on a fast regex/literal scan for file-level edges across JS/TS plus lightweight polyglot heuristics. That keeps refreshes cheap, but computed imports/requires, tsconfig path aliases, alias-heavy barrel re-exports, and non-literal cross-language edges remain best-effort rather than full AST-resolved truth.
- `policy.js` and `approvals.js` treat `docs/workflow/POLICY.md` as the source of truth and keep `.workflow/runtime/policy.json` plus `.workflow/runtime/approvals.json` in sync as derived mirrors.
- `rai doctor` audits both canonical workflow health and install-surface integrity, including package scripts, runtime files, skill installation, and the visible version marker.

## Workflow lanes

- Full raiola: milestone lifecycle with plan and audit gates.
- Quick mode: lighter artifact set for narrow tasks.
- Team Lite: explicit parallel routing with disjoint write-scope safety.
- Lifecycle closeout: review, ship, PR brief, release notes, session report.

## Runtime companion layer

- `rai launch` and `rai codex` provide strong-start orientation.
- `rai codex` manages the real native `.codex/` project layer while keeping backup journals and rollback metadata under `.workflow/runtime/codex-control/`.
- `rai manager` and `rai hud --watch` provide live operator visibility.
- `rai explore`, `rai verify-shell`, and `rai verify-browser` provide purpose-built exploration and evidence capture.
- `rai route`, `rai stats`, `rai profile`, and `rai workspaces` provide operator routing, telemetry, and workspace center surfaces.
- `rai dashboard` now reads start-plan bundle/profile/add-on/candidate metadata so the local HTML control room mirrors the same guided workflow surface the CLI exposes.
- `rai route --why` and `rai do --explain` now expose rejected alternatives, ambiguity class, and language-mix grounding for the chosen lane.
- `rai packet explain` now emits a compiler summary that condenses route, scope, risks, questions, claims, impacted packages/tests, and evidence slots into a task-aware context packet.
- `rai route replay`, `rai route eval`, `rai codex bootstrap`, `rai codex promptpack`, and `rai codex resume-card` extend the operator surface from phase-only routing into task-aware bootstrap packets, prompt packs, and resume cards.
- `rai team mailbox`, `rai team timeline`, `rai team supervise`, `rai team merge-queue`, and `rai patch-review` expose runtime collect/merge/review state directly in-product.
- `rai monorepo` materializes package-aware write scopes, verify plans, and performance risk notes under both docs and runtime cache surfaces.
- `rai review-orchestrate` materializes package/persona/wave review plans that can feed Team Lite, subagents, or Codex plan-subagents.
- `rai verify-browser` and `rai ui-review` now carry browser-level accessibility and journey audits alongside visual evidence.
- `rai ui-direction` gives frontend lanes a taste-aware target before UI spec and plan generation starts.


## Frontend start intelligence

The frontend product layer now sits between raw `map-frontend` output and the start/do/dashboard surfaces. It classifies frontend goals into delivery, review, refactor, polish, or ship-readiness lanes, then feeds the selected bundle plus recommended overlays (`surface`, `design-system`, `state`, `browser`, `trust`, `docs`, `handoff`) into the same structured plan contract used elsewhere.

This keeps route selection, page/component inventory, design-system alignment, UX-state ownership, and dashboard visibility on one shared data model instead of forcing each surface to rediscover frontend context independently.
