# Roadmap Audit

This document cross-checks [`ROADMAP.md`](../ROADMAP.md) against the current repository state.

## Summary

- The roadmap's product surfaces from `P0` through `P9` are present in the repo.
- This audit pass also closed the remaining gaps around full-workflow CLI ergonomics and CI-backed performance enforcement.
- The canonical contract remains markdown-first; runtime metadata stays regenerable.

## Phase Matrix

| Phase | Status | Evidence |
| --- | --- | --- |
| `P0` Compatibility baseline | complete | `tests/workflow_phase*.test.js`, `tests/golden/workflow/*`, `scripts/compare_golden_snapshots.ts` |
| `P1` Product shell | complete | `bin/cwf.js`, `scripts/cli/cwf.js`, `scripts/workflow/setup.js`, `scripts/workflow/update.js`, `scripts/workflow/uninstall.js` |
| `P2` Codex-native skill surface | complete | `skill/SKILL.md`, `skill/README.md`, short alias mapping in the product docs |
| `P3` Quick mode | complete | `scripts/workflow/quick.js`, `.workflow/quick/*.md`, `tests/workflow_phase12.test.js` |
| `P4` Team orchestration | complete | `scripts/workflow/team.js`, `scripts/workflow/delegation_plan.js`, `.workflow/orchestration/*` |
| `P5` Lifecycle closeout | complete | `scripts/workflow/review.js`, `ship.js`, `pr_brief.js`, `release_notes.js`, `session_report.js` |
| `P6` Hot-path cache | complete | `scripts/workflow/perf/metrics.js`, `scripts/workflow/packet/cache.js`, benchmark harness |
| `P7` Incremental repo index | complete | `scripts/workflow/fs_index.js`, `map_codebase.js`, `map_frontend.js`, `.workflow/fs-index.json` |
| `P8` Modular core split | complete | `scripts/workflow/io/files.js`, `scripts/workflow/markdown/sections.js`, `scripts/workflow/packet/cache.js` |
| `P9` Trust and docs | complete | `README.md`, `docs/*`, `LICENSE`, `CHANGELOG.md`, `CONTRIBUTING.md`, `DEMO.md` |

## Gaps Closed In This Audit

- `cwf doctor` now checks install-surface integrity in addition to canonical workflow health.
- A visible product version marker now lives at `.workflow/VERSION.md` and is refreshed by install/update flows.
- CLI help and docs now expose the full closeout/reporting surface without drift.
- `cwf milestone` now opens a full milestone directly from the product shell.
- Installed repos now retain setup/update/uninstall backward-compat scripts and a repo-local `bin/cwf.js` fallback.
- Benchmark SLOs now have an enforceable `--assert-slo` path and are exercised in repository CI.

## CI Benchmark Status

- Performance targets are now measured in repository CI through [`.github/workflows/ci.yml`](../.github/workflows/ci.yml), which runs `npm test` and `node scripts/workflow/benchmark.js --runs 3 --assert-slo`.
