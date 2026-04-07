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

### Three golden flows

- Solo daily loop: `cwf do`, `cwf next`, `cwf verify-shell`, `cwf checkpoint`, `cwf next-prompt`
- Deep review: `cwf route`, `cwf review`, `cwf ui-review`, `cwf verify-work`, `cwf ship-readiness`
- Team parallel: `cwf monorepo`, `cwf team run`, `cwf team supervise`, `cwf team merge-queue`, `cwf patch-review`, `cwf sessions`

Run `cwf help` to start from these flows. Use `cwf help all` for the full shell, or `cwf help <topic>` for focused categories like `frontend`, `trust`, `runtime`, or `codex`.

### Core shell

- `cwf setup`
- `cwf doctor`
- `cwf do`
- `cwf next`
- `cwf review`
- `cwf team`
- `cwf dashboard`

### Full reference

The full command surface still exists; it now lives in [Commands](./docs/commands.md) and `cwf help all` instead of overwhelming the first-run README.

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
cwf help solo
cwf codex setup --repo
cwf do "Land the first slice"
cwf note "Capture the first risk" --promote backlog
cwf manager
cwf dashboard --open
cwf doctor --strict
cwf discuss --goal "Clarify the next slice"
cwf hud --compact
cwf next
```

Repo-local fallback if the global `cwf` binary is not installed yet:

```bash
node bin/cwf.js help
node bin/cwf.js doctor --strict
```

## Runtime support

- Node.js: `>=20` (`.nvmrc` is pinned to `20` for local development)
- Full support: macOS and Linux
- Smoke-tested install/help flows: Windows
- `cwf doctor --strict` checks install integrity plus host advisories such as Git, ripgrep, platform support, and browser-opening helpers
- `cwf health --strict` stays focused on blocking workflow/runtime issues so optional host-tool gaps do not downgrade the main gate

## Daily loop

Use the product shell when the repo already has workflow installed:

```bash
cwf do "resume the current slice"
cwf manager
cwf dashboard
cwf hud --compact
cwf explore --changed
cwf packet compile --step plan
cwf secure
cwf assumptions add "Playwright may be absent locally" --impact medium --exit-trigger "Browser adapter is installed"
cwf verify-shell --cmd "npm test"
cwf claims check
cwf evidence
cwf verify-work
cwf ui-spec
cwf ui-review
cwf approval plan
cwf ship-readiness
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

## Advanced Codex surfaces

The current build adds repo-native surfaces aimed at making Codex materially stronger on large and messy codebases:

- `cwf do "请做代码审查并验证浏览器"` or `cwf do "revisa el frontend y mejora el diseño"`  
  Multilingual routing now grounds intent, steering, and deterministic capability picks across major languages instead of assuming English-only prompts.
- `cwf do "look into why the verification plan feels weak before patching"` or `cwf do "neden verify plani zayif bir bak ve kok nedeni acikla"`  
  English and Turkish conversational routing now handles more natural operator phrasing such as `look into`, `put together`, `go over`, `double-check`, `get this out`, `bir bak`, `hazirla`, `elden gecir`, `previewu smoke et`, `parcalara bol`, and `yayina al`.
- `cwf do "act like a head developer and go ovre the diff"` or `cwf do "teknik lider gibi milestone paketini hazrla"`  
  English/Turkish routing now also recognizes persona-based intent packs and nearby typos, so role framing and lightly misspelled operator phrases still route to the right Codex lane.
- `cwf codex promptpack --goal "review the auth diff"`  
  Writes a ready-to-paste Codex prompt pack with profile, verify contract, repo signals, the generated context pack, optional UI direction, monorepo hotspots, and the latest review orchestration/task-graph context.
- `cwf codex contextpack --goal "review the auth diff"`  
  Produces a budgeted context pack for Codex app/CLI sessions with ordered attachments, focus files, compact/balanced/deep presets, and explicit avoid-patterns to fight context rot on wide repos.
- `cwf ui-direction --goal "premium minimal analytics dashboard" --taste premium-minimal`  
  Produces a taste-aware design brief (`docs/workflow/UI-DIRECTION.md`) with archetype-aware design tokens, component cues, interaction cues, and style guardrails so frontend work is not just “correct” but intentionally styled.
- `cwf design-dna --goal "developer tool landing page with product proof"`  
  Produces `docs/workflow/DESIGN-DNA.md` with external reference blend, product-category reasoning, and anti-pattern bans so Codex can borrow the right visual DNA without cloning one source.
- `cwf page-blueprint --goal "developer tool landing page"`  
  Produces `docs/workflow/PAGE-BLUEPRINT.md` with section map, proof surfaces, responsive priorities, and page-type sequencing for the current frontend slice.
- `cwf design-md --goal "developer tool landing page" --project-root`  
  Produces `docs/workflow/DESIGN.md` plus an optional repo-root `DESIGN.md` mirror so downstream agents/tools can consume a portable design contract directly.
- `cwf component-strategy --goal "developer tool landing page"`  
  Produces `docs/workflow/COMPONENT-STRATEGY.md` so Codex can decide what to reuse, extract, and build before page-local component sprawl starts.
- `cwf design-benchmark --goal "developer tool landing page"`  
  Produces `docs/workflow/DESIGN-BENCHMARK.md` with differentiation plays and commodity-risk checks so external-site UI work stays distinctive instead of template-like.
- `cwf state-atlas --goal "analytics dashboard with filters and detail panes"`  
  Produces `docs/workflow/STATE-ATLAS.md` with required loading/empty/error/success and high-risk transition states so frontend work does not stop at the happy path.
- `cwf frontend-brief --goal "developer tool landing page"`  
  Produces a one-shot frontend artifact pack (`FRONTEND-BRIEF`, `DESIGN.md`, benchmark, component strategy, blueprint, state atlas, UI spec) for external-site work.
- `cwf review-tasks`  
  Converts review findings into a blocker-first four-wave task graph (triage → synthesis → fix → verify) that can drive large-repo review and re-review loops.
- `cwf review-orchestrate`  
  Converts review findings into package/persona/wave-based review work for large repos and monorepos.
- `cwf monorepo`  
  Builds package-aware write scopes, review shards, hotspots, context slices, context budgets, targeted verify plans, and performance-risk notes for broad repos.

These surfaces are designed to stay backward-compatible with the canonical markdown workflow instead of replacing it.

## Natural-Language Routing

`cwf do` is no longer tuned just for terse command-like prompts. The current routing layer is optimized to understand both English and Turkish operator language in a more natural form.

- Research: `look into why routing confidence is low`, `bir bak neden verify plani zayif`
- Plan: `put together the next execution packet`, `bir sonraki milestone paketini hazirla`
- Review: `go over the diff and call out blockers`, `elden gecir ve riskleri yaz`
- Verify: `double-check the test suite`, `previewu smoke et ve ekran goruntusu al`
- Team: `split this up across packages`, `bunu parcalara bol ve paketlere dagit`
- Ship: `get this out with handoff notes`, `bunu yayina al ve handoff notlarini ekle`
- Persona-aware: `as a qa engineer smoke test the preview`, `urun tasarimcisi gibi premium dashboard ui spec hazrla`
- Typo-tolerant: `go ovre the diff and call out blokers`, `milestone paketini hazrla`

This support is enforced through the routing corpus and roadmap audit rather than living only in docs.

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
- `POLICY.md`

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
- `cwf policy` and `cwf approvals` keep `docs/workflow/POLICY.md` canonical and mirror it into `.workflow/runtime/policy.json` plus `.workflow/runtime/approvals.json`.
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
- repo-specific `.workflowignore` support for index hot paths
- package graph cache at `.workflow/cache/package-graph.json`
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
- `codex contextpack <1.5s warm`
- `codex promptpack <1.8s warm`

Run the benchmark harness:

```bash
cwf benchmark
```

The benchmark surface covers every documented hot-path target, including `launch`, `manager`, `next-prompt`, `codex contextpack`, and `codex promptpack`.

Run the roadmap truth-reset audit:

```bash
npm run workflow:roadmap-audit
```

Or:

```bash
npm run workflow:benchmark -- --commands hud,doctor,map-codebase --assert-slo
```

Or benchmark the operator surfaces directly:

```bash
cwf benchmark --commands launch,manager,next-prompt
```

Fixture-backed benchmark runs are also supported:

```bash
cwf benchmark --fixture medium --commands hud,map-codebase
cwf benchmark --fixture large --commands hud
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
