# Roadmap Audit

This document cross-checks [`Roadmap.md`](../Roadmap.md) against the current repository state.

## Summary

- The historical `P0` through `P9` product surfaces remain intact.
- The roadmap command families now exist as first-class repo-local product surfaces: Codex control, daily intent/capture, trust, packet lock, team runtime, evidence, policy, integrations, scale, and incident/operator-center layers.
- Intent OS v2, Codex profile/bootstrap surfaces, Review OS, Frontend OS, Phase 8 trust surfaces, and fixture-backed Scale OS are now implemented as repo-local command families rather than roadmap placeholders.
- Truth-reset instrumentation now has a measurable audit surface via `node scripts/workflow/roadmap_audit.js --assert`, backed by intent/review/frontend corpora plus doctor/health risk scores.
- The canonical contract remains markdown-first; runtime metadata, mirrors, caches, telemetry, and fallback control-plane files remain derived state.

## Latest Local Audit

- On `2026-04-06`, the latest local audit pass succeeded for `node --test tests/*.test.js`, `node bin/cwf.js doctor --strict`, and fixture-backed benchmark passes.
- The latest local test result now includes the new phase-16 suite for intent/review/frontend/fixture coverage.
- The latest local doctor result is `0 fail / 0 warn`.
- The latest benchmark stayed under SLO with warm medians of `hud 69ms`, `next 60ms`, `doctor 48ms`, `health 50ms`, `map-codebase 59ms`, and `map-frontend 56ms`.
- The measured roadmap audit now enforces `220` intent utterances, `26` review diff scenarios, and `12` frontend audit scenarios with intent top-1 accuracy `100%`, top-3 coverage `100%`, review pass-rate `100%`, and frontend pass-rate `100%`.
- The roadmap audit now reflects the repo-local fallback behavior for the virtual `.codex` root, the `playwright` browser adapter fallback when Playwright is unavailable, and the canonical `POLICY.md` governance surface.

## CE Matrix

| Roadmap phase | Status | Evidence |
| --- | --- | --- |
| `CE0` Program freeze and baseline | complete | [`Roadmap.md`](../Roadmap.md), this audit doc, updated README/commands/architecture/performance docs |
| `CE1` Safe Codex control plane | complete | `scripts/workflow/codex_control.js`, [`docs/codex-integration.md`](../docs/codex-integration.md), `.workflow/runtime/codex-control/*`, diff/doctor/rollback/sync/role scaffolding surfaces |
| `CE2` Role, prompt, skill catalog | complete | repo-derived roles in `codex_control.js`, generated role/prompt catalogs, install/remove skill flows |
| `CE3` Daily Intent OS | complete | `scripts/workflow/do.js`, `note.js`, `thread.js`, `backlog.js`, `docs/workflow/BACKLOG.md`, `docs/workflow/THREADS/*` |
| `CE4` Trust layer | complete | `scripts/workflow/questions.js`, `claims.js`, `secure_phase.js`, `docs/workflow/QUESTIONS.md`, `docs/workflow/CLAIMS.md`, `docs/workflow/SECURITY.md` |
| `CE5` Context compiler and packet lock | complete | `scripts/workflow/packet.js`, `scripts/workflow/build_packet.js`, `.workflow/packets/*`, `.workflow/cache/packet-locks.json`, `.workflow/cache/packet-provenance.json` |
| `CE6` Native subagent runtime and hybrid dispatch | complete | `scripts/workflow/team_runtime.js`, `scripts/workflow/team_adapters/subagent.js`, `scripts/workflow/team_adapters/hybrid.js`, adapter-backed packet workspaces and hybrid dispatch |
| `CE7` Patch-first collect and Manager 2.0 surfaces | complete | mailbox/timeline in `.workflow/orchestration/runtime/*.jsonl`, patch bundles in `.workflow/orchestration/patches/*`, `patch-review/apply/rollback` commands |
| `CE8` Evidence / Trust / Policy OS | complete | `scripts/workflow/verify_browser.js`, `scripts/workflow/evidence.js`, `scripts/workflow/verify_work.js`, `scripts/workflow/ship_readiness.js`, `scripts/workflow/approvals.js`, `.workflow/evidence-graph/latest.json`, `.workflow/reports/verify-work.json`, `.workflow/reports/ship-readiness.json` |
| `CE9` Policy engine and approval matrix | complete | `scripts/workflow/policy.js`, `scripts/workflow/approvals.js`, `docs/workflow/POLICY.md`, `.workflow/runtime/policy.json`, `.workflow/runtime/approvals.json` |
| `CE10` Telemetry v2 and adaptive routing | complete | `scripts/workflow/model_route.js`, `scripts/workflow/stats.js`, `.workflow/cache/model-routing.json`, local perf/runtime/quality/spend views in `stats` |
| `CE11` Hooks, MCP, notify | complete | `scripts/workflow/hooks.js`, `mcp.js`, `notify.js`, `.workflow/runtime/hooks/*`, `.workflow/runtime/mcp/*`, `.workflow/runtime/notifications.jsonl` |
| `CE12` Scale OS | complete | `scripts/workflow/daemon.js`, `gc.js`, `explore.js` symbol/caller/impact modes, `.workflow/runtime/daemon.json` |
| `CE13` Incident memory and operator center | complete | `scripts/workflow/incident.js`, `fleet.js`, `sessions.js`, `.workflow/incidents/*`, `cwf fleet`, `cwf sessions` |
| `CE14` Intent OS v2 + Codex profile engine | complete | `scripts/workflow/capability_registry.js`, `intent_engine.js`, `codex_profile_engine.js`, upgraded `do.js`, `model_route.js`, `codex_control.js` |
| `CE15` Review OS v1 | complete | `scripts/workflow/review_engine.js`, `review_findings.js`, upgraded `review.js`, `review_mode.js`, `pr_review.js`, `re_review.js` |
| `CE16` Frontend OS v1 | complete | `scripts/workflow/frontend_os.js`, `ui_spec.js`, `ui_plan.js`, `ui_review.js`, `component_inventory.js`, `responsive_matrix.js`, `design_debt.js`, `preview.js` |
| `CE17` Fixture-backed Scale OS | complete | `scripts/workflow/package_graph.js`, `.workflowignore`, `.workflow/cache/package-graph.json`, `benchmark.js --fixture`, medium/large monorepo fixtures |

## Implementation Notes

- `cwf codex` uses a repo-local virtual `.codex` root and stores its generated mirror under `.workflow/runtime/codex-control/`. This keeps the flow rollback-safe inside the repo sandbox while preserving the Codex control-plane contract.
- `cwf verify-browser --adapter playwright` now exposes the adapter surface directly. If Playwright is not installed in the repo, the command records a controlled fallback instead of silently failing.
- `cwf team run --adapter hybrid` now combines worktree and subagent packet workspaces, writes mailbox/timeline events, and emits patch bundles during collect.
- `cwf policy` and `cwf approvals` now treat `docs/workflow/POLICY.md` as the canonical ledger and keep runtime JSON mirrors derived from that document.
- `cwf stats` now exposes perf/runtime/quality/spend slices from local benchmark, verification, evidence, route, and orchestration state.
- `cwf route` now records explainable capability choices, confidence, ambiguity, replay, and eval state.
- `doctor` and `health` now emit a real `risk` payload with score, level, and top contributing factors instead of only raw fail/warn counts.
- `cwf codex` now suggests profiles, bootstraps task packets, generates resume cards, and suggests bounded subagent plans.
- `cwf review` now emits findings, heatmap, blockers, replay, and patch suggestions in `.workflow/reports/`.
- `cwf dashboard` now composes route, review, verification, package heatmap, and browser gallery state into a repo-local operator HTML surface at `.workflow/runtime/dashboard/index.html`.
- `cwf ui-spec`, `ui-plan`, `ui-review`, `component-map`, `responsive-matrix`, `design-debt`, and `preview` now generate canonical frontend review artifacts, including missing-state and token-drift signals.
- `cwf verify-work`, `cwf approval plan`, and `cwf ship-readiness` now close the roadmap Phase 8 trust gap by generating actionable fix plans, pending approval requests, and a ship gate score.
- `scripts/workflow/roadmap_audit.js` writes `.workflow/reports/roadmap-audit.json` so corpus quality stays reviewable in CI and local audits.

## Regression Evidence

- Product-shell coverage now includes `cwf codex`, `do`, `note`, `thread`, `backlog`, `questions`, `claims`, `secure`, `packet`, `evidence`, `policy`, `approvals`, `hooks`, `mcp`, `notify`, `daemon`, `gc`, `incident`, `fleet`, `sessions`, and patch commands.
- [`tests/workflow_phase15.test.js`](../tests/workflow_phase15.test.js) now exercises the Codex control-plane lifecycle directly: setup, diff, doctor, repo-derived roles/prompts, scaffold-role, install/remove-skill, repair, uninstall, and rollback.
- [`tests/workflow_phase15.test.js`](../tests/workflow_phase15.test.js) verifies the new daily-intent, governance, team runtime, browser adapter, and patch surfaces.
- Existing compatibility tests still pass across the earlier phase suites, including help snapshot, setup/update/uninstall, quick mode, team orchestration, packet v5, and closeout flows.

## CI Benchmark Status

- Performance targets remain enforced through [`.github/workflows/ci.yml`](../.github/workflows/ci.yml), which runs the full Node test suite plus `node scripts/workflow/benchmark.js --runs 3 --assert-slo`.
- The same CI workflow now runs `node scripts/workflow/roadmap_audit.js --assert --json` and uploads the audit report artifact.
