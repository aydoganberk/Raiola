# codex-workflow-kit

`codex-workflow-kit` is a repo-native workflow product for Codex.

It turns workflow discipline into an installable CLI and runtime surface instead of a loose script bundle. The goal is simple: keep long-running work safe, resumable, auditable, and fast enough to use every day.

## Why it exists

This project is for repositories where “just continue from memory” is not enough.

It helps when you need:

- canonical markdown state instead of hidden runtime state
- explicit plan gates before execute starts
- checkpoint-first continuity across sessions
- quick mode for small tasks without losing audit trails
- Team Lite orchestration with visible write-scope safety
- review-ready and ship-ready closeout packages

## Product surface

### CLI

- `cwf setup`
- `cwf init`
- `cwf milestone`
- `cwf doctor`
- `cwf hud`
- `cwf next`
- `cwf checkpoint`
- `cwf quick`
- `cwf team`
- `cwf review`
- `cwf ship`
- `cwf update`
- `cwf uninstall`

### Backward compatibility

All existing `npm run workflow:*` commands stay available, including setup/update/uninstall surfaces. The new CLI wraps the current runtime; it does not replace the canonical markdown contract.

### Skill aliases

- `$workflow-help`
- `$workflow-next`
- `$workflow-quick`
- `$workflow-checkpoint`
- `$workflow-team`
- `$workflow-review`
- `$workflow-ship`

## Install

If the package is available through `npx`:

```bash
npx codex-workflow-kit setup
```

If you are working from this repository:

```bash
node bin/cwf.js setup --target /path/to/target-repo
```

Inside a repo where the package is already available:

```bash
cwf setup
cwf milestone --id M1 --name "Initial setup" --goal "Land the first slice"
cwf doctor --strict
cwf hud --compact
cwf next
```

Repo-local fallback if the global `cwf` binary is not installed yet:

```bash
node bin/cwf.js help
node bin/cwf.js doctor --strict
```

## Daily loop

Use the product shell when the repo already has workflow installed:

```bash
cwf hud --compact
cwf next
cwf checkpoint --next "Resume here"
cwf review
cwf ship
```

Legacy equivalents still work:

```bash
npm run workflow:hud -- --compact
npm run workflow:next
npm run workflow:checkpoint -- --next "Resume here"
npm run workflow:review
npm run workflow:ship
```

## Quick, Full, Team

### Quick mode

Use `cwf quick` for 15-60 minute, single-operator work with a narrow touched surface.

Quick mode stores canonical markdown under `.workflow/quick/`:

- `context.md`
- `plan.md`
- `verify.md`
- `handoff.md`

`session.json` is only a resume/index helper. A quick task is not “done” until markdown scope, verify, and handoff notes exist.

### Full workflow

Use the full workflow when the task needs milestone planning, cross-session coordination, stronger validation, or review/ship closeout.

Canonical markdown lives in `docs/workflow/` or the active named workstream root:

- `STATUS.md`
- `CONTEXT.md`
- `EXECPLAN.md`
- `VALIDATION.md`
- `HANDOFF.md`
- `WINDOW.md`

### Team Lite orchestration

Use `cwf team` when the user explicitly asks for parallelism or delegation.

Canonical orchestration artifacts live under `.workflow/orchestration/`:

- `PLAN.md`
- `STATUS.md`
- `WAVES.md`
- `RESULTS.md`

`state.json` is runtime metadata only. It is not the source of truth.

## Trust model

These rules are the core contract:

- Markdown remains canonical.
- Runtime JSON is cache, index, or HUD convenience only.
- Visible product version metadata lives at `.workflow/VERSION.md` so `cwf update` can reason about install drift.
- Quick mode does not bypass the plan/checkpoint/audit spine.
- Write-capable parallel work requires explicit disjoint write scope.
- Resume safety is checkpoint-first, not memory-first.
- `common.js` remains backward-compatible while newer modules take over hot-path responsibilities.

## Performance

The runtime now includes:

- invocation-scope file read caching
- markdown field/section cache
- packet snapshot cache
- repo fs index at `.workflow/fs-index.json`
- benchmark output at `.workflow/benchmarks/latest.json`

Run the benchmark harness:

```bash
cwf benchmark
```

Or:

```bash
npm run workflow:benchmark -- --commands hud,doctor,map-codebase --assert-slo
```

CI also runs the benchmark with SLO enforcement via [`.github/workflows/ci.yml`](./.github/workflows/ci.yml).

## Closeout surfaces

These commands write operator-facing reports under `.workflow/reports/`:

- `cwf review` -> `review.md`
- `cwf ship` -> `ship.md`
- `cwf pr-brief` -> `pr-brief.md`
- `cwf release-notes` -> `release-notes.md`
- `cwf session-report` -> `session-report.md`

## Repository docs

- [Getting Started](./docs/getting-started.md)
- [Commands](./docs/commands.md)
- [Architecture](./docs/architecture.md)
- [Performance](./docs/performance.md)
- [Roadmap Audit](./docs/roadmap-audit.md)
- [Demo](./DEMO.md)
- [Contributing](./CONTRIBUTING.md)
- [Changelog](./CHANGELOG.md)

## Development

Run the full test suite:

```bash
npm test
```

Smoke the product shell:

```bash
node bin/cwf.js help
node scripts/workflow/setup.js --target /tmp/example-repo --skip-verify
```

## License

[MIT](./LICENSE)
