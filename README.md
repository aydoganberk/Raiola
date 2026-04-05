# codex-workflow-kit

`codex-workflow-kit` is a repo-native workflow product for Codex.

It turns workflow discipline into an installable CLI and runtime companion instead of a loose script bundle. The goal is simple: keep long-running work safe, resumable, auditable, observable, and fast enough to use every day.

## Why it exists

This project is for repositories where “just continue from memory” is not enough.

It helps when you need:

- canonical markdown state instead of hidden runtime state
- explicit plan gates before execute starts
- checkpoint-first continuity across sessions
- quick mode for small tasks without losing audit trails
- Team Lite orchestration with visible write-scope safety
- review-ready and ship-ready closeout packages
- live operator visibility, bounded verification, and dry-run repair

## Product surface

### Operator shell

- `cwf launch`
- `cwf codex`
- `cwf do`
- `cwf note`
- `cwf thread`
- `cwf backlog`
- `cwf manager`
- `cwf setup`
- `cwf init`
- `cwf milestone`
- `cwf doctor`
- `cwf health`
- `cwf questions`
- `cwf claims`
- `cwf secure`
- `cwf hud`
- `cwf next`
- `cwf explore`
- `cwf verify-shell`
- `cwf verify-browser`
- `cwf packet`
- `cwf evidence`
- `cwf checkpoint`
- `cwf next-prompt`
- `cwf quick`
- `cwf team`
- `cwf policy`
- `cwf approvals`
- `cwf route`
- `cwf stats`
- `cwf profile`
- `cwf workspaces`
- `cwf hooks`
- `cwf mcp`
- `cwf notify`
- `cwf daemon`
- `cwf gc`
- `cwf incident`
- `cwf fleet`
- `cwf sessions`
- `cwf patch-review`
- `cwf patch-apply`
- `cwf patch-rollback`
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
cwf codex setup --repo
cwf do "Land the first slice"
cwf note "Capture the first risk" --promote backlog
cwf manager
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
cwf do "resume the current slice"
cwf manager
cwf hud --compact
cwf explore --changed
cwf packet compile --step plan
cwf secure
cwf verify-shell --cmd "npm test"
cwf claims check
cwf evidence
cwf next
cwf checkpoint --next "Resume here"
cwf next-prompt
cwf review
cwf ship
```

Legacy equivalents still work:

```bash
npm run workflow:launch
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

`state.json` is runtime metadata only. It is not the source of truth. Adapter runtime metadata lives under `.workflow/orchestration/runtime/`. The `worktree` adapter creates real child workspaces when the repo has a usable git history, `subagent` creates packet/result workspaces, and `hybrid` splits tasks between them while keeping mailbox/timeline state visible.

## Trust model

These rules are the core contract:

- Markdown remains canonical.
- Runtime JSON is cache, index, HUD, manager, launch, or telemetry convenience only.
- `.workflow/runtime/*.json` and `.workflow/runtime/*.md` are derived operator surfaces only.
- Visible product version metadata lives at `.workflow/VERSION.md` so `cwf update` can reason about install drift.
- Quick mode does not bypass the plan/checkpoint/audit spine.
- Write-capable parallel work requires explicit disjoint write scope.
- Resume safety is checkpoint-first, not memory-first.
- `doctor --repair` and `health --repair` default to dry-run and do not silently rewrite canonical markdown.
- `cwf codex` uses a repo-local virtual `.codex` root and stores the generated control-plane mirror under `.workflow/runtime/codex-control/` so the flow remains rollback-safe inside the repo sandbox.
- `common.js` remains backward-compatible while newer modules take over hot-path responsibilities.

## Performance

The runtime now includes:

- invocation-scope file read caching
- markdown field/section cache
- packet snapshot cache
- repo fs index at `.workflow/fs-index.json`
- write-on-change state/index writes
- shared in-process collector for `launch`, `hud`, `manager`, and `next-prompt`
- benchmark output at `.workflow/benchmarks/latest.json`

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

Run the benchmark harness:

```bash
cwf benchmark
```

Or:

```bash
npm run workflow:benchmark -- --commands hud,doctor,map-codebase --assert-slo
```

CI also runs the benchmark with SLO enforcement via [`.github/workflows/ci.yml`](./.github/workflows/ci.yml).

## Runtime companion surfaces

- `cwf launch` writes `.workflow/runtime/launch.json`
- `cwf hud` writes `.workflow/runtime/hud.json`
- `cwf manager` writes `.workflow/runtime/manager.json`
- `cwf next-prompt` writes `.workflow/runtime/next-prompt.md`
- `cwf verify-shell` writes `.workflow/verifications/shell/*`
- `cwf verify-browser` writes `.workflow/verifications/browser/*` with HTML, headers, and a visual evidence artifact
- `cwf route` writes `.workflow/cache/model-routing.json`

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
