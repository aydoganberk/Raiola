# Performance

## Targets

Current product targets for medium-size repos:

- `hud <300ms`
- `next <500ms`
- `doctor <1s`
- `health <1s`
- `map-codebase <2s`
- `map-frontend <2s`
- `launch <800ms cold / <300ms warm`
- `manager <400ms warm`
- `next-prompt <150ms warm`
- `codex contextpack <1.5s warm`
- `codex promptpack <1.8s warm`

## Implemented performance surfaces

- invocation-scope file read cache
- markdown field and section cache
- packet snapshot cache
- token estimate cache
- cached `safeExec` results within a single invocation
- repo fs index at `.workflow/fs-index.json`
- repo-specific `.workflowignore` support to keep hot paths out of noisy directories
- package graph cache at `.workflow/cache/package-graph.json`
- impacted test ownership and internal dependency edges in the package graph cache
- monorepo intelligence cache at `.workflow/cache/monorepo-intelligence.json`
- symbol graph cache at `.workflow/cache/symbol-graph.json`
- write-on-change state surfaces for `.workflow/state.json` and `.workflow/fs-index.json`
- shared in-process runtime collector for `launch`, `hud`, `manager`, and `next-prompt`
- multilingual intent normalization and deterministic capability matching to avoid repeated fallback routing on non-English prompts
- package-aware write-scope synthesis so broad parallel execute requests do not default to repo-wide edit scopes in monorepos
- review orchestration artifacts that let large-review passes shard by package and persona instead of re-reading the whole repo every time
- repo-local Codex control mirror under `.workflow/runtime/codex-control/`
- packet lock and provenance cache under `.workflow/cache/packet-locks.json` and `.workflow/cache/packet-provenance.json`
- mailbox/timeline logs under `.workflow/orchestration/runtime/*.jsonl`

## Benchmarking

Run:

```bash
rai benchmark
```

The benchmark surface covers every documented hot-path target, including `launch`, `manager`, `next-prompt`, `codex contextpack`, and `codex promptpack`.

Or:

```bash
npm run workflow:benchmark -- --commands hud,doctor,map-codebase --runs 3 --assert-slo
```

Or focus on operator-facing runtime commands directly:

```bash
rai benchmark --commands launch,manager,next-prompt --assert-slo
```

Fixture-backed benchmarks are also supported:

```bash
rai benchmark --fixture small --commands hud,next
rai benchmark --fixture medium --commands hud,map-codebase
rai benchmark --fixture large --commands hud
```

The benchmark writes `.workflow/benchmarks/latest.json`.

Use `--thresholds` to override the default medium-repo budgets when you need an explicit pass/fail gate:

```bash
rai benchmark --assert-slo --thresholds hud=300,next=500,doctor=1000
```

Release CI runs the benchmark with `--assert-slo` from [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

Route and stats telemetry write `.workflow/cache/model-routing.json`, verify surfaces write evidence under `.workflow/verifications/`, monorepo planning writes `.workflow/cache/monorepo-intelligence.json`, review orchestration writes `.workflow/reports/review-orchestration.{md,json}`, and evidence graph refreshes write `.workflow/evidence-graph/latest.json`.

## Perf metrics

When benchmark mode is active, commands write latest counters to `.workflow/cache/perf-metrics/latest.json`.

Useful counters include:

- file read requests
- file read cache hits and misses
- markdown field/section cache hits and misses
- packet snapshot cache hits and misses

## Index semantics

`.workflow/fs-index.json` is not canonical. It stores repo file metadata so repeated map runs can tell whether the repo surface is current or changed without redoing all higher-level work.

`.workflow/cache/symbol-graph.json` is also non-canonical. It stores incremental symbol, export, and local import edges so `explore`, `review`, and `daemon` can reason about impacted callers and tests without paying full grep cost each time.

`.workflowignore` lets a repo denylist additional large or noisy paths without changing the product code.

`.workflow/state.json`, `.workflow/runtime/*.json`, and `.workflow/runtime/*.md` are also non-canonical. They now use write-on-change semantics so watch/manager refreshes avoid unnecessary disk churn.


## Large monorepo guidance

For very large repos, the fastest path is no longer “scan everything, then decide”:

- run `rai monorepo` once and reuse the generated package slices, review shards, and verify plan
- let `rai review-orchestrate` split deep review into parallel read-only package/persona waves
- use `rai codex promptpack` so Codex sessions inherit the latest route, verify contract, UI direction, and review/monorepo context without rebuilding them each time
- prefer package-local write scopes over broad repo-root scopes during Team Lite or subagent execution

This reduces redundant repo walks, narrows verification, and keeps large-repo orchestration fluid under parallel execution.
