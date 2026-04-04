# Performance

## Targets

Current product targets for medium-size repos:

- `hud <300ms`
- `next <500ms`
- `doctor <1s`
- `health <1s`
- `map-codebase <2s`
- `map-frontend <2s`

## Implemented performance surfaces

- invocation-scope file read cache
- markdown field and section cache
- packet snapshot cache
- token estimate cache
- cached `safeExec` results within a single invocation
- repo fs index at `.workflow/fs-index.json`

## Benchmarking

Run:

```bash
cwf benchmark
```

Or:

```bash
npm run workflow:benchmark -- --commands hud,doctor,map-codebase --runs 3 --assert-slo
```

The benchmark writes `.workflow/benchmarks/latest.json`.

Use `--thresholds` to override the default medium-repo budgets when you need an explicit pass/fail gate:

```bash
cwf benchmark --assert-slo --thresholds hud=300,next=500,doctor=1000
```

Release CI runs the benchmark with `--assert-slo` from [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

## Perf metrics

When benchmark mode is active, commands write latest counters to `.workflow/cache/perf-metrics/latest.json`.

Useful counters include:

- file read requests
- file read cache hits and misses
- markdown field/section cache hits and misses
- packet snapshot cache hits and misses

## Index semantics

`.workflow/fs-index.json` is not canonical. It stores repo file metadata so repeated map runs can tell whether the repo surface is current or changed without redoing all higher-level work.
