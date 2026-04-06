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

## Implemented performance surfaces

- invocation-scope file read cache
- markdown field and section cache
- packet snapshot cache
- token estimate cache
- cached `safeExec` results within a single invocation
- repo fs index at `.workflow/fs-index.json`
- repo-specific `.workflowignore` support to keep hot paths out of noisy directories
- package graph cache at `.workflow/cache/package-graph.json`
- write-on-change state surfaces for `.workflow/state.json` and `.workflow/fs-index.json`
- shared in-process runtime collector for `launch`, `hud`, `manager`, and `next-prompt`
- repo-local Codex control mirror under `.workflow/runtime/codex-control/`
- packet lock and provenance cache under `.workflow/cache/packet-locks.json` and `.workflow/cache/packet-provenance.json`
- mailbox/timeline logs under `.workflow/orchestration/runtime/*.jsonl`

## Benchmarking

Run:

```bash
cwf benchmark
```

Or:

```bash
npm run workflow:benchmark -- --commands hud,doctor,map-codebase --runs 3 --assert-slo
```

Fixture-backed benchmarks are also supported:

```bash
cwf benchmark --fixture small --commands hud,next
cwf benchmark --fixture medium --commands hud,map-codebase
cwf benchmark --fixture large --commands hud
```

The benchmark writes `.workflow/benchmarks/latest.json`.

Use `--thresholds` to override the default medium-repo budgets when you need an explicit pass/fail gate:

```bash
cwf benchmark --assert-slo --thresholds hud=300,next=500,doctor=1000
```

Release CI runs the benchmark with `--assert-slo` from [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

Route and stats telemetry write `.workflow/cache/model-routing.json`, verify surfaces write evidence under `.workflow/verifications/`, and evidence graph refreshes write `.workflow/evidence-graph/latest.json`.

## Perf metrics

When benchmark mode is active, commands write latest counters to `.workflow/cache/perf-metrics/latest.json`.

Useful counters include:

- file read requests
- file read cache hits and misses
- markdown field/section cache hits and misses
- packet snapshot cache hits and misses

## Index semantics

`.workflow/fs-index.json` is not canonical. It stores repo file metadata so repeated map runs can tell whether the repo surface is current or changed without redoing all higher-level work.

`.workflowignore` lets a repo denylist additional large or noisy paths without changing the product code.

`.workflow/state.json`, `.workflow/runtime/*.json`, and `.workflow/runtime/*.md` are also non-canonical. They now use write-on-change semantics so watch/manager refreshes avoid unnecessary disk churn.
