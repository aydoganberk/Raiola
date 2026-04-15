# Raiola

`raiola` is a repo-native workflow OS for Codex.

It installs a product shell, a markdown-canonical control plane, and repo-local runtime helpers so long-running engineering work stays resumable, reviewable, auditable, and safe to parallelize.

The public shell is `rai`. The published package is `raiola`. The blank-state onboarding entry is `raiola-on`. The source package keeps a compact npm surface, while installed repos can materialize repo-local `raiola:*` fallbacks when needed.

## Start In Five Minutes

Learn only four commands first:

- `rai start`
- `rai do`
- `rai next`
- `rai verify`

Choose the path that matches your repo:

```bash
# existing repo
npx raiola setup
rai help quickstart
rai doctor --strict
rai start recommend --goal "fix the next safe slice and verify it"

# blank repo
npx raiola setup
rai on next
rai milestone --id M1 --name "Initial slice" --goal "Land the first safe slice"

# frontend repo
rai start recommend --goal "ship the dashboard surface"
rai start frontend --goal "ship the dashboard surface" --with browser|docs
```

The deeper surfaces stay available, but the intended day-one product is the starter surface above plus the guided flows in [docs/quickstart.md](docs/quickstart.md) and [docs/getting-started.md](docs/getting-started.md).
When the task is intentionally narrow, `rai quick start --goal "land the small fix safely"` keeps you in the lighter quick lane without opening the full milestone surface.
You can also point the deeper audit surfaces at a local snapshot without changing directories first, for example `rai repo-proof --repo ../candidate-repo --json`, `rai api-surface --repo ../candidate-repo --json`, or `rai audit-repo --repo ../candidate-repo --goal "audit the snapshot" --json`.

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
  Optional repo-local fallback scripts materialized by setup/update when the selected script profile asks for them.

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

## Lifecycle Facade

Raiola now ships a thin lifecycle facade over the deeper workflow engine:

- `rai spec`
- `rai plan`
- `rai build`
- `rai test`
- `rai simplify`
- `rai review`
- `rai ship`

These commands are the preferred first layer when you want explicit workflow discipline without memorizing the whole shell.

## Workflow bundles and packaged starts

The product entry is now `rai start`. It turns overlapping features into packaged workflow bundles so the operator does not have to manually stitch together audit, review, fix, verify, frontend, or monorepo commands. The strongest code-quality lanes now intentionally behave like four product surfaces instead of a pile of adjacent commands:

- `review` for diff or scoped code review
- `repo` for repo-wide code audit and hotspot ranking
- `monorepo` for large-repo shard-aware review and correction waves
- `correction` for bounded code correction, verification, and re-review closure

Use it when you want the harness to feel like a product instead of a toolbox:

- `rai start --goal "land the next safe slice"` for normal repo delivery
- `rai start review --goal "deep review the current diff"` for blocker-first code review waves
- `rai start repo --goal "audit the repo and rank correction waves"` for repo-wide code audit
- `rai start monorepo --goal "review and patch the top-risk monorepo subsystem"` for large repos
- `rai start correction --goal "fix the highest-risk review findings and verify the patch wave"` for bounded code correction
- `rai start frontend --goal "ship the premium dashboard surface"` for frontend-first work
- `rai start ship --goal "close the release safely"` for verify and closeout
- `rai start recommend --goal "ship the premium dashboard surface"` when you want the harness to pick the bundle, depth, and supporting overlays first

`rai start` now carries three product layers instead of only a bundle picker:

- bundles choose the main lane
- start profiles (`speed`, `balanced`, `deep`) control how wide the lane becomes
- add-ons (`trust`, `docs`, `handoff`, `parallel`, `browser`, `surface`, `design-system`, `state`, `ownership`, `regression`, `shard`, `repair`) package overlapping helper commands back into the same entry

That means you can stay in one command even when the work needs evidence, docs, browser proof, handoff outputs, page inventory, design-system alignment, UX-state coverage, ownership overlays, shard planning, regression matrices, or patchability guidance:

- `rai start review --goal "deep review the current diff" --with trust|repair|regression`
- `rai start repo --goal "audit the repo and rank correction waves" --with ownership|repair`
- `rai start correction --goal "fix the highest-risk review findings and verify the patch wave" --with repair|regression`
- `rai start frontend --goal "ship the premium dashboard surface" --profile deep --with trust|browser|docs`
- `rai start frontend-refactor --goal "extract cleaner shared dashboard primitives" --with surface|state`
- `rai start frontend-polish --goal "tighten spacing, tokens, and loading states" --with design-system|state`
- `rai start frontend-ship --goal "run UI release signoff with browser proof" --with recommended`
- `rai start ship --goal "close the release safely" --with recommended`

Frontend routing is also more productized now: `rai start recommend` and `rai do` can distinguish between frontend delivery, review, refactor, polish, and UI ship-readiness instead of collapsing everything into a generic frontend bucket. The dashboard mirrors that choice through a dedicated frontend control-room panel with surface metrics, detected stack, focus areas, and suggested add-ons.

Review and correction routing are also more productized now: `rai review`, `rai review-mode`, `rai audit-repo`, `rai monorepo-mode`, and `rai fix` all feed the same findings registry and review-correction control plane. That shared layer writes `.workflow/reports/findings-registry.json` plus `.workflow/reports/correction-control.{json,md}`, and the dashboard surfaces the result through **Review Control Room**, **Correction Board**, and **Large Repo Board** panels.

Trust and release routing now sit on the same status language too: `rai verify-work` and `rai ship-readiness` refresh the shared review/correction registry when review or repo-audit evidence exists, then write `.workflow/reports/release-control.{json,md}` so verification queues, ship blockers, pending approvals, and release waves show up through **Verify Status Board** and **Ship Readiness Board** panels instead of living in isolated summaries.

The next product layer is now explicit too: repo-native control planes sit above the raw capabilities. `rai operate` is the unified operating center that ranks those planes, `rai repo-config` materializes stack-aware defaults and stack packs, `rai repo-control` turns package graph + hotspots + workspace posture into one repo-wide control room, `rai workspace-impact` maps changed packages, blast radius, development waves, and verification order for the current monorepo slice, `rai monorepo-control` turns dependency hubs + impact waves + workspace coordination into one large-monorepo control room, `rai frontend-control` turns frontend evidence + states + design debt into one UI control room, `rai safety-control` turns security posture + failure forecasts + self-healing repair guidance into one safety control room, `rai trust` answers whether the work is safe to start/merge/ship, `rai release-control` turns review + verify + ship artifacts into a change-management gate, materializes the supporting ship surfaces, converges explainability with continuity, and emits a machine-readable control-plane packet alongside the external exports, `rai control-plane-publish` regenerates GitHub / CI / Slack bridge artifacts from the latest gate with stable self-referential paths, `rai autopilot` suggests routine automation and recovery actions, `rai handoff` compiles continuity artifacts plus the decision basis needed to resume safely, `rai team-control` surfaces multi-agent operations, `rai measure` tracks ROI and control-plane integrity metrics, `rai explain` makes routing/bundle choices inspectable, and `rai lifecycle` turns install/update/repair/config/export drift into one lifecycle surface.

These planes write their own repo-native artifacts under `.workflow/reports/`, `.workflow/runtime/`, and `.workflow/exports/`, and the dashboard now renders them as first-class panels instead of leaving them as isolated markdown files. Each bundle writes a structured start plan to `.workflow/runtime/start-plan.json` and `.workflow/runtime/start-plan.md`, and the dashboard can surface that plan as a quick action together with bundle profile, add-ons, candidate bundles, operator tips, the Operating Center, Trust Center, Change Control, Autopilot, Handoff OS, Measurement / ROI, Explainability, and Lifecycle Center. The CI layer can also publish sticky PR comments, check summaries, step summaries, status badge JSON, issue-tracker JSON, Slack payloads, repo status, export manifests, and a machine-readable control-plane packet from the same control-plane state. Stack packs now add opinionated defaults for Next.js apps, Express APIs, Cloudflare Workers, Supabase/Stripe repos, monorepos, design-system-heavy frontends, and repo-native CLIs through `.workflow/repo-config.json`. See [docs/workflow-bundles.md](docs/workflow-bundles.md) for the catalog and [docs/control-planes.md](docs/control-planes.md) for the new operating surfaces.

## Portable Agent Pack

This repository also ships a portable agent-facing surface:

- split skills under `skills/`
- personas under `agents/`
- quick references under `references/`
- Claude commands under `.claude/commands/`
- native Codex config, hooks, subagents, operator runbooks, evals, and managed-policy exports under `.codex/`
- Codex plugin marketplace metadata under `.agents/plugins/`
- installable plugin packaging under `plugins/raiola-codex-optimizer/`
- first-party GitHub review prompts under `.github/codex/`
- Claude compatibility under `.claude-plugin/`
- root repo instructions in `AGENTS.md`

## Product Surface At A Glance

The public shell is intentionally compressed. Daily use should feel like a small product, not a second operating system. Most repos should stay on **six golden paths**, while deeper capability packs stay opt-in.

### Golden paths

- `rai start`
  Open the best-fit bundle for the current goal and repo shape.
- `rai do "..."`
  Route a natural-language request into the right lane without learning the full command catalog.
- `rai next`
  Ask for the next safe move from current workflow state.
- `rai codex operator --goal "..."`
  Shape the native Codex session from repo truth, task, current risk, changed packages, and verification debt.
- `rai repo-config`
  Materialize the repo’s active stack packs, trust posture, required verifications, and preferred planes.
- `rai trust` / `rai release-control`
  Answer “is this safe to merge or ship?” and materialize closeout artifacts when the answer must be explicit.

### Core loop

Use these when you want the smallest possible daily surface:

- `rai on next` -> blank-state or first-run entry
- `rai spec` / `rai plan` -> define the slice before editing
- `rai build` / `rai test` -> execute and prove the slice
- `rai checkpoint` / `rai next-prompt` -> preserve continuity between sessions
- `rai hud` / `rai manager` -> compact status and operator summary

### Advanced packs

Open these only when the repo or task justifies them:

- **Monorepo pack**: `rai workspace-impact`, `rai monorepo-control`, `rai audit-repo --mode oneshot --json`, `rai review-orchestrate`
- **Frontend pack**: `rai map-frontend`, `rai frontend-control`, `rai verify-browser`, `rai ui-review`
- **API / trust pack**: `rai api-surface`, `rai trust`, `rai safety-control`
- **Team pack**: `rai team-control`, `rai handoff`, `rai measure`
- **Codex pack**: `rai codex cockpit`, `rai codex telemetry`, `rai codex managed-export`
- **Lifecycle pack**: `rai doctor`, `rai health`, `rai lifecycle`, `rai control-plane-publish`

### Why the surface is split this way

- The default shell stays small enough for one operator to learn quickly.
- Repo-specific complexity still exists, but it is opened as a pack instead of always sitting in the foreground.
- Native Codex shaping, verify contracts, write boundaries, and hook policy remain visible without forcing the operator to memorize every internal plane name.

For the exhaustive command inventory, use [docs/commands.md](docs/commands.md). For Codex-specific shaping, use [docs/codex-orchestration.md](docs/codex-orchestration.md). For the deeper operating surfaces, use [docs/control-planes.md](docs/control-planes.md).

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

Or stay inside npm with the compact universal entry:

```bash
npm run rai -- help quickstart
npm run rai -- repo-proof -- --repo ../candidate-repo --json
```

### Verify the install

```bash
rai help
rai help lifecycle
rai help bundles
rai start recommend --goal "ship the premium dashboard surface"
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

## The Four Starter Flows

### Solo daily loop

Use this when one operator is moving one safe slice at a time.

```bash
rai help lifecycle
rai spec --goal "land the next safe slice"
rai plan --goal "land the next safe slice"
rai build --goal "land the next safe slice"
rai test --cmd "npm test"
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

### Large monorepo loop

Use this when the repository is broad enough that staged repo mapping, subsystem ranking, and bounded patch planning are more valuable than a one-shot review prompt.

```bash
rai help monorepo
rai workspace-impact --json
rai monorepo-control --json
rai monorepo
rai monorepo-mode --goal "review and patch the top-risk monorepo subsystem"
rai review-mode --goal "deep review the selected subsystem"
rai verify-work
rai ship-readiness
```

This flow refreshes `AGENTS.md`, `docs/workflow/REPO_MAP.md`, `docs/workflow/REVIEW_SCOPE.md`, `docs/workflow/PATCH_PLAN.md`, `.workflow/reports/workspace-impact.{md,json}`, `.workflow/reports/monorepo-control-room.{md,json}`, and `.workflow/reports/monorepo-mode.{md,json}`.

## Agent-Friendly Packaging

If you want to use Raiola as a plugin-style rules pack instead of only an npm-installed workflow OS, start from:

- `AGENTS.md`
- `skills/using-raiola/SKILL.md`
- `.claude/commands/*`
- native `.codex/hooks.json`

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

Raiola keeps the on-disk state names repo-native on purpose: the product, CLI, plugin, and skill surface use the `rai` / `raiola` identity, while the written state stays under generic `docs/workflow` and `.workflow` paths so the repo reads like workflow data rather than a tool-private namespace.

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
  Review, monorepo-mode, ship, PR brief, release note, and closeout outputs.
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

`setup`, `init`, `migrate`, `update`, and repair flows patch `.gitignore` so `.workflow/` does not flood normal diffs while portable `.agents/` assets remain shareable.

## Compatibility And Stability Model

- `rai` is the public shell and should appear in user-facing docs.
- `raiola` is the package identity.
- `raiola-on` is the clean first-run entry.
- The source package intentionally keeps a compact npm script surface.
- Installed repos can still materialize `raiola:*` npm fallbacks through script profiles.
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

Trusted publishing is configured for the `raiola` package against `aydoganberk/Raiola` and `.github/workflows/release.yml`, so normal tag-driven releases publish to npm without a long-lived token.

If the npm trust relationship is ever rotated or broken, restore the GitHub Actions trusted publisher in the npm package settings before cutting the next release. The workflow still supports `NPM_TOKEN` as an emergency fallback, but it is no longer required for standard releases.

## Contributing, Security, License

- [Contributing](./CONTRIBUTING.md)
- [Security Policy](./SECURITY.md)
- [MIT License](./LICENSE)

### Operating layer additions

- **Formal lifecycle FSM** via `rai lifecycle --json` with valid and blocked transitions
- **Agent runtime contract** that exposes detected Codex / Claude / Cursor / Aider surfaces
- **Richer browser verification** with accessibility-tree artifacts and Playwright-backed screenshots when present
- **Worktree isolation hardening** with shared `node_modules` symlink support for parallel workers


## Runtime Supervisor

- `rai supervisor` opens the runtime supervisor surface that fuses lifecycle, operating center, policy gates, worktrees, and verification signals.
- `rai dashboard --tui` renders the terminal-native control room for side-by-side tmux/screen usage.
- `.workflow/policy.rules` adds declarative policy overrides with a compact DSL (`allow`, `warn`, `require_approval`, `block`, `grant`).

