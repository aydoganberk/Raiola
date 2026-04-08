# Raiola

`raiola` is a repo-native workflow OS for Codex.

It installs a product shell, a markdown-canonical control plane, and repo-local runtime helpers so long-running engineering work stays resumable, reviewable, auditable, and safe to parallelize.

The public shell is `rai`. The published package is `raiola`. The blank-state onboarding entry is `raiola-on`. Repo-local npm fallbacks use the `raiola:*` namespace.

## What Raiola Is For

Raiola is built for repositories where "continue from memory" stops scaling.

Use it when you need:

- checkpoint-first continuity across sessions
- canonical markdown state instead of opaque agent memory
- explicit discuss, plan, execute, audit, and closeout gates
- bounded shell and browser verification with stored evidence
- review and ship-readiness surfaces that emit reusable artifacts
- Codex prompt packs and context packs that live with the repo
- explicit write scopes for parallel work
- a safer way to move between solo work, quick tasks, review passes, and team fan-out

Raiola is not a hosted service and not a remote control plane. It is a repo-local product surface that writes files into the repository so the workflow stays inspectable.

## Naming Model

- `rai`
  The primary command surface used in docs, examples, screenshots, and tests.
- `raiola`
  The npm package name and published product identity.
- `raiola-on`
  The first-run onboarding entry for blank-state repositories.
- `raiola:*`
  Repo-local npm fallback scripts created by setup/update.

If you are reading old notes or old internal artifacts, treat `cwf` and `codex-workflow` as retired names rather than active product surfaces.

## How Raiola Works

Raiola has a simple contract:

1. Install a repo-local shell and workflow surface.
2. Open a milestone or a quick task.
3. Route work through explicit lanes instead of informal memory.
4. Verify changes with stored evidence.
5. Checkpoint before pause, compaction, or handoff.
6. Resume from markdown and runtime mirrors instead of reconstructing context by guesswork.

The design center is:

- markdown is canonical
- runtime JSON is derived
- checkpoints are first-class
- verification is stored, not implied
- delegation requires explicit write scope

## Product Surface At A Glance

### Onboarding and daily loop

- `rai on next`
  Open the clean first-run entry and get a milestone proposal when nothing is active.
- `rai do`
  Route a natural-language goal into the right lane.
- `rai next`
  Recommend the next safe move from current workflow state.
- `rai hud`
  Show compact status for the active lane.
- `rai manager`
  Show the operator summary surface.
- `rai checkpoint`
  Save a continuity checkpoint before pause or handoff.
- `rai next-prompt`
  Emit a compact resume prompt for the next session.

### Full workflow lifecycle

- `rai milestone`
  Open a full-workflow milestone with explicit lifecycle state.
- `rai discuss`
  Build or inspect the current problem framing.
- `rai assumptions`
  Track assumptions and their exit triggers.
- `rai claims`
  Track evidence-backed claims.
- `rai plan-check`
  Enforce the seeded plan gate before execution starts.
- `rai pause-work`
  Pause with a checkpoint-first contract.
- `rai resume-work`
  Resume with continuity state intact.

### Quick lane

- `rai quick start`
  Start a narrow task without opening a full milestone.
- `rai quick close`
  Close the task with visible artifacts.
- `rai quick escalate`
  Promote quick work into a full milestone when the task grows.

### Review and trust

- `rai review`
  Generate a review-ready package.
- `rai review-mode`
  Run the deeper multi-pass review engine.
- `rai review-tasks`
  Turn findings into a blocker-first task graph.
- `rai pr-review`
  Review a PR or diff surface directly.
- `rai re-review`
  Replay earlier findings against current state.
- `rai verify-shell`
  Run bounded shell verification and store evidence.
- `rai verify-browser`
  Run browser smoke verification and store evidence.
- `rai verify-work`
  Summarize gaps and propose fix work.
- `rai ship-readiness`
  Produce a ship gate with blockers and residual risk.

### Team and parallel execution

- `rai team`
  Operate Team Lite orchestration.
- `rai subagents`
  Suggest bounded parallel slices.
- `rai monorepo`
  Build package-aware execution guidance.
- `rai patch-review`
  Review collected patch bundles.
- `rai patch-apply`
  Apply a collected patch bundle.
- `rai patch-rollback`
  Roll back an applied bundle.
- `rai sessions`
  Inspect active runtime surfaces for parallel work.

### Frontend and design direction

- `rai ui-direction`
- `rai design-dna`
- `rai page-blueprint`
- `rai design-md`
- `rai component-strategy`
- `rai design-benchmark`
- `rai state-atlas`
- `rai frontend-brief`
- `rai ui-recipe`
- `rai ui-spec`
- `rai ui-plan`
- `rai ui-review`
- `rai preview`
- `rai component-map`
- `rai responsive-matrix`
- `rai design-debt`

These commands turn UI work into explicit product and verification artifacts instead of ad hoc prompt text.

### Codex surfaces

- `rai codex`
  Operate the safe Codex control plane.
- `rai codex promptpack`
  Build a ready-to-paste Codex prompt pack.
- `rai codex contextpack`
  Build a budgeted attachment set for Codex sessions.
- `rai launch`
  Start a session with stronger routing context.
- `rai dashboard`
  Open the repo-local operator control room.

## Install

### Try it with `npx`

```bash
npx raiola setup
```

Fresh installs default to the focused `pilot` script profile so a new repository gets the highest-signal shell without maximum package.json churn.

Upgrade the install surface when you need more:

```bash
npx raiola setup --script-profile core
npx raiola setup --script-profile full
```

### Install from this source repository

```bash
node bin/rai.js setup --target /path/to/target-repo
```

### Verify the install

```bash
rai help
rai doctor --strict
rai hud --compact
```

If `rai` is not on PATH yet, the repo-local entry still works:

```bash
node bin/rai.js help
node bin/rai.js doctor --strict
```

## First Run On A Blank Repo

```bash
npx raiola setup
rai on next
rai doctor --strict
rai milestone --id M1 --name "Initial slice" --goal "Land the next safe slice"
rai do "land the next safe slice"
rai next
rai checkpoint --next "Resume from the next recommended step"
```

`rai on next` is the preferred blank-state entry. If no milestone is open, it proposes the next milestone command. If a milestone is already active, it hands off to the live next-step surface.

You can also call the onboarding binary directly:

```bash
raiola-on next
```

## The Three Golden Flows

### Solo daily loop

Use this when one operator is moving one safe slice at a time.

```bash
rai help solo
rai on next
rai do "resume the current slice"
rai explore --changed
rai verify-shell --cmd "npm test"
rai checkpoint --next "Resume from verification follow-up"
rai next-prompt
```

### Deep review loop

Use this when the main job is reducing risk rather than building a fresh slice.

```bash
rai help review
rai route --goal "review the current diff" --why
rai review --heatmap
rai ui-review --url ./preview.html
rai verify-work
rai ship-readiness
```

### Team parallel loop

Use this when the user explicitly wants delegation or the repository is broad enough that write scopes matter.

```bash
rai help team
rai monorepo
rai team run --adapter hybrid --activation-text "parallel yap" --write-scope src,tests
rai team collect --patch-first
rai patch-review
rai sessions
```

## What Gets Written Into The Repo

### Canonical workflow state

- `docs/workflow/`
  Full-workflow markdown state.
- `.workflow/quick/`
  Quick-lane canonical artifacts.
- `.workflow/orchestration/`
  Team Lite orchestration state.

### Derived runtime and evidence

- `.workflow/runtime/`
  Runtime mirrors such as HUD, manager, dashboard, and companion JSON outputs.
- `.workflow/verifications/`
  Shell and browser verification artifacts.
- `.workflow/reports/`
  Review, ship, PR brief, release note, and closeout outputs.
- `.workflow/cache/`
  Caches, indexes, and hot-path data.
- `.workflow/fs-index.json`
  File-system index for faster repo-aware surfaces.

The rule is simple: if it is markdown workflow state, it is canonical; if it is runtime JSON, telemetry, or dashboard state, it is derived.

## Install Profiles

- `pilot`
  Lean default install with the highest-signal surface.
- `core`
  Broader day-to-day shell with curated npm fallbacks.
- `full`
  Maximum install surface, including the full repo-local `raiola:*` fallback namespace.

Move between profiles in place:

```bash
rai update --script-profile core
rai update --script-profile full
```

## Runtime And Platform Support

- Node.js `>=22`
- `.nvmrc` pinned to `22`
- CI on Node `22` and `24`
- Full support on macOS and Linux
- Smoke-tested install and help flows on Windows

`setup`, `init`, `migrate`, `update`, and repair flows also patch `.gitignore` so `.workflow/` and `.agents/` do not flood normal diffs.

## Compatibility And Stability Model

- `rai` is the public shell and should appear in user-facing docs.
- `raiola` is the package identity.
- `raiola-on` is the clean first-run entry.
- `raiola:*` npm scripts remain supported for installed repos.
- Old names such as `cwf` and `codex-workflow` are no longer active product surfaces.
- Installer, updater, repair, and uninstall code still recognize retired names where needed so existing repos can migrate cleanly.

## Documentation Map

- [Getting Started](./docs/getting-started.md)
- [Commands](./docs/commands.md)
- [Architecture](./docs/architecture.md)
- [Performance](./docs/performance.md)
- [Codex Integration](./docs/codex-integration.md)
- [Codex Upgrade](./docs/codex-upgrade.md)
- [Roadmap Audit](./docs/roadmap-audit.md)
- [Demo](./DEMO.md)

## Developing Raiola

For work on this repository itself:

```bash
npm test
npm run pack:smoke
node scripts/workflow/roadmap_audit.js --assert --json
node bin/rai.js help
```

`npm test` covers the CLI, workflow surfaces, runtime helpers, review and verification behavior, and command/doc drift checks. `npm run pack:smoke` verifies that the published tarball installs cleanly into a temp consumer repo.

## Maintainer Release Flow

Raiola ships through a two-step automated release path:

1. Run the `Cut Release` GitHub Actions workflow and choose `patch`, `minor`, or `major`.
2. The workflow updates `package.json`, `scripts/workflow/product_version.js`, and `CHANGELOG.md`, commits the release, creates `vX.Y.Z`, and pushes both commit and tag.
3. The tag triggers the `Release` workflow, which runs smoke checks, publishes to npm, and creates or updates the matching GitHub Release from the `CHANGELOG.md` section for that version.

Until npm trusted publishing is configured for the package, the `Release` workflow can still publish by using the `NPM_TOKEN` repository secret. After trusted publishing is configured, the same workflow can publish without a long-lived token.

## Contributing, Security, License

- [Contributing](./CONTRIBUTING.md)
- [Security Policy](./SECURITY.md)
- [MIT License](./LICENSE)
