# Raiola

`raiola` is a repo-native workflow OS for Codex.

It installs a product shell, a markdown-canonical control plane, and repo-local runtime helpers so long-running engineering work stays resumable, reviewable, auditable, and safe to parallelize.

`rai` is the primary CLI shell. The published package is `raiola`. Repo-local npm fallbacks use the `raiola:*` namespace, and `raiola-on` is the first-run onboarding entry.

## Why raiola exists

`raiola` is built for repositories where "just continue from memory" stops working.

It is useful when you need:

- checkpoint-first continuity across sessions
- canonical markdown state instead of hidden agent state
- explicit plan and audit gates before changes are called done
- bounded shell and browser verification with stored evidence
- review and ship-readiness surfaces that produce reusable artifacts
- repo-local Codex prompt packs and context packs
- safe delegation with visible write scopes for parallel work

## What the product includes

- `rai do`, `rai next`, and `rai route` for daily intent routing
- full workflow milestones with discuss, research, plan, execute, audit, and complete phases
- quick mode for narrow 15-60 minute tasks
- Team Lite orchestration for bounded parallel execution
- review, re-review, PR review, patch review, and ship-readiness surfaces
- frontend and design-direction surfaces for UI-heavy work
- repo-local Codex control, prompt packs, context packs, and resume aids
- operator visibility through `hud`, `manager`, `dashboard`, telemetry, and reports

## Core ideas

- Markdown is canonical.
  Files under `docs/workflow/`, `.workflow/quick/`, and `.workflow/orchestration/` are the source of truth for workflow state.
- Runtime JSON is derived.
  Cache, telemetry, dashboard, packet, and runtime mirrors are convenience surfaces, not the contract.
- Resume safety is checkpoint-first.
  `raiola` is designed so a session can stop and resume without relying on hidden memory.
- Parallel work must be explicit.
  Write-capable fan-out only becomes safe when ownership and write scopes are clear.

## Install

### Try it with `npx`

```bash
npx raiola setup
```

Fresh installs default to the focused `pilot` profile so first-run repos only get the highest-signal shell.

Upgrade the install surface when you need more:

```bash
npx raiola setup --script-profile core
npx raiola setup --script-profile full
```

### Install from this source repository

```bash
node bin/rai.js setup --target /path/to/target-repo
```

### Use it after install

```bash
rai help
rai doctor --strict
rai do "land the next safe slice"
rai next
```

If `rai` is not on PATH yet, the repo-local fallback still works:

```bash
node bin/rai.js help
node bin/rai.js doctor --strict
```

## Runtime support

- Node.js `>=22`
- `.nvmrc` is pinned to `22` for local development
- CI covers Node `22` and `24`
- Full support on macOS and Linux
- Smoke-tested install and help flows on Windows

`setup`, `init`, `migrate`, and `update` also patch `.gitignore` by default so `.workflow/` and `.agents/` do not flood normal repo diffs.

## First 5 minutes

```bash
npx raiola setup
rai on next
rai doctor --strict
rai hud --compact
rai milestone --id M1 --name "Initial slice" --goal "Land the next safe slice"
rai do "land the next safe slice"
rai next
```

If you are setting up Codex-specific repo helpers as well:

```bash
rai codex setup --repo
rai manager
rai dashboard --open
```

## The three golden flows

### Solo daily loop

Use this when one operator is moving one safe slice at a time.

```bash
rai on next
rai help solo
rai do "resume the current slice"
rai explore --changed
rai verify-shell --cmd "npm test"
rai checkpoint --next "Resume from verification follow-up"
rai next-prompt
```

### Deep review loop

Use this when the repo already has changes and your main goal is risk reduction.

```bash
rai help review
rai route --goal "review the current diff" --why
rai review --heatmap
rai ui-review --url ./preview.html
rai verify-work
rai ship-readiness
```

### Team parallel loop

Use this when the user explicitly asks for delegation or the repo is broad enough that write scopes matter.

```bash
rai help team
rai monorepo
rai team run --adapter hybrid --activation-text "parallel yap" --write-scope packages/app-one,packages/app-two
rai team collect --patch-first
rai patch-review
rai sessions
```

## Major product surfaces

### Workflow lanes

- `rai quick`
  Start, inspect, close, or escalate a narrow task.
- `rai milestone`
  Open a full-workflow milestone with explicit lifecycle state.
- `rai team`
  Operate Team Lite orchestration and runtime collection.

### Trust and verification

- `rai doctor --strict`
  Audit install integrity and host prerequisites.
- `rai health --strict`
  Check blocking workflow/runtime health only.
- `rai verify-shell`
  Run a bounded shell verification command and store evidence.
- `rai verify-browser`
  Run browser smoke checks and selector-level assertions.
- `rai verify-work`
  Summarize verification gaps and emit an actionable fix plan.

### Review and ship

- `rai review`
  Run the multi-pass review engine and emit structured findings.
- `rai review-mode`
  Use the deeper explicit review lane.
- `rai review-tasks`
  Turn findings into a blocker-first task graph.
- `rai review-orchestrate`
  Split review work into package/persona/wave plans for larger repos.
- `rai ship-readiness`
  Produce a ship gate with remaining blockers and risks.

### Codex surfaces

- `rai codex promptpack --goal "..."`
  Build a ready-to-paste Codex prompt pack with route, verify, and repo context.
- `rai codex contextpack --goal "..."`
  Build a budgeted attachment set for Codex app or CLI sessions.
- `rai next-prompt`
  Emit a compact resume prompt for the next session.
- `rai manager`
  Produce the repo-local operator summary surface.
- `rai dashboard --open`
  Open the local HTML control room for route, review, and screenshot state.

### Frontend and design direction

- `rai ui-direction`
  Create a taste-aware direction brief for UI work.
- `rai design-dna`
  Capture product-category and reference-system guidance.
- `rai page-blueprint`
  Build a section map and proof plan for a page.
- `rai component-strategy`
  Decide what to reuse, extract, and build before UI sprawl starts.
- `rai design-benchmark`
  Check differentiation and template-risk for external-facing UI.
- `rai state-atlas`
  Enumerate empty, loading, error, and transition states.
- `rai frontend-brief`
  Produce a one-shot frontend artifact pack for implementation sessions.

## What gets written into the repo

### Canonical workflow files

- Full raiola: `docs/workflow/`
- Quick mode: `.workflow/quick/`
- Team Lite orchestration: `.workflow/orchestration/`

### Derived runtime and evidence

- Runtime mirrors and dashboards: `.workflow/runtime/`
- Verification evidence: `.workflow/verifications/`
- Reports: `.workflow/reports/`
- Cache and indexes: `.workflow/cache/`, `.workflow/fs-index.json`

The design rule is simple: if it is markdown workflow state, it is canonical; if it is JSON or operator UI state, it is derived.

## Install profiles

- `pilot`
  Lean default install with the highest-signal surface.
- `core`
  Broader day-to-day shell with curated npm aliases.
- `full`
  Maximum install surface, including every repo-local `raiola:*` fallback.

Move between them in-place:

```bash
rai update --script-profile core
rai update --script-profile full
```

## Compatibility model

- `rai` is the public shell used in docs and examples.
- `raiola` is the package name.
- `raiola-on` is the clean first-run entry for proposing a milestone from scratch.
- `raiola:*` npm scripts remain supported for installed repos.

## Documentation map

- [Getting Started](./docs/getting-started.md)
- [Commands](./docs/commands.md)
- [Architecture](./docs/architecture.md)
- [Performance](./docs/performance.md)
- [Codex Integration](./docs/codex-integration.md)
- [Codex Upgrade](./docs/codex-upgrade.md)
- [Roadmap Audit](./docs/roadmap-audit.md)

## Developing raiola

For work on this repository itself:

```bash
npm test
npm run pack:smoke
node scripts/workflow/roadmap_audit.js --assert --json
node bin/rai.js help
```

`npm test` covers the CLI, workflow surfaces, review/runtime behavior, and golden help/docs drift checks. `npm run pack:smoke` verifies that the packaged tarball installs cleanly into a temp consumer repo.

## Maintainer release flow

`raiola` now has a two-step automated release path:

1. Run the `Cut Release` GitHub Actions workflow and choose `patch`, `minor`, or `major`.
2. The workflow updates `package.json`, `scripts/workflow/product_version.js`, and `CHANGELOG.md`, commits the release, creates `vX.Y.Z`, and pushes both to `main`.
3. The tag triggers the `Release` workflow, which runs smoke checks, publishes to npm, and creates or updates the matching GitHub Release from the `CHANGELOG.md` section for that version.

Until npm trusted publishing is configured for the package, the `Release` workflow can still publish by using the `NPM_TOKEN` repository secret. After trusted publishing is set on npm, the same workflow can publish without a long-lived token.

## Contributing, security, license

- [Contributing](./CONTRIBUTING.md)
- [Security Policy](./SECURITY.md)
- [MIT License](./LICENSE)
