# Getting Started

## Five-minute path

Start with four commands and only open deeper packs when the repo demands them:

- `rai start`
- `rai do`
- `rai next`
- `rai verify`

Use `rai help quickstart` for the fastest blank-repo, existing-repo, frontend, and monorepo entry paths.

## Install into a repo

Supported runtime baseline:

- Node.js `>=22`
- Full support on macOS and Linux
- Smoke-tested install/help flows on Windows

The primary shell is `rai`, the published package is `raiola`, the source package keeps a compact npm surface, and installed repos can optionally materialize `raiola:*` fallbacks.

From a published package:

```bash
npx raiola setup --dry-run --json
npx raiola setup
```

The dry-run payload is the recommended first step for existing repos. It tells you exactly what would touch `package.json`, `.gitignore`, `.workflow/`, `.codex/`, and release/CI surfaces before any file is written.

Fresh setup defaults to the focused `pilot` workflow profile. This keeps package.json and the repo-local `rai` shell leaner on first install. Use `--script-profile core` for the full shell with curated npm aliases, or `--script-profile full` for every repo-local `raiola:*` fallback on day one.

The best blank-state entry after setup is:

```bash
rai on next
raiola-on next
```

The default product entry after setup is now:

```bash
rai start --goal "land the next safe slice"
rai start recommend --goal "fix the highest-risk review findings and verify the patch wave"
rai help bundles
```

Use explicit bundles when the repo shape is obvious, or let the start layer choose bundle depth and overlays for you:

```bash
rai start review --goal "review the current diff"
rai start repo --goal "audit the repo and rank correction waves"
rai start monorepo --goal "review and patch the top-risk monorepo subsystem"
rai start correction --goal "fix the highest-risk review findings and verify the patch wave"
```

The quickest way to learn the thin lifecycle surface is:

```bash
rai help lifecycle
```

From this repository:

```bash
node bin/rai.js setup --target /path/to/target-repo
```

If `rai` is not on your PATH yet, the installed repo still includes a local fallback:

```bash
node bin/rai.js help
node bin/rai.js doctor --strict
```

The universal npm entry works in both the source repo and installed repos:

```bash
npm run rai -- help quickstart
npm run rai -- start --goal "land the next safe slice"
npm run rai -- repo-proof -- --repo ../candidate-repo --json
```

## Choose your starting path

Use `rai help` to start from the golden flows, then `rai help bundles` when you want the harness to choose and package the right command stack for you. `rai start recommend --goal "..."` is the fastest way to see the selected bundle, start profile, recommended add-ons, and alternate bundle candidates before you commit to a lane. Pick the path that matches how your repo usually works.

If you want the smallest command surface first, begin with:

```bash
rai help lifecycle
rai spec --goal "..."
rai plan --goal "..."
```

### Solo maintainer

Best for a single operator moving one safe slice at a time.

```bash
rai help solo
rai doctor --strict
rai start --goal "land the next safe slice"
rai start slice --goal "land the next safe slice" --profile speed
rai milestone --id M1 --name "Initial setup" --goal "Land the first workflow-backed slice"
rai next
```

### Review-heavy team

Best when the repo already has changes and your main job is code review, regressions, and safe closeout quality.

```bash
rai help review
rai start review --goal "review the current diff" --with trust|repair|regression
rai route --goal "review the current diff" --why
rai review --heatmap
rai dashboard
rai ship-readiness
```

### Code-quality control plane

Best when you want code review, code audit, repo review, and code correction to feel like one connected product lane instead of separate commands.

```bash
rai start recommend --goal "fix the highest-risk review findings and verify the patch wave"
rai start repo --goal "audit the repo and rank correction waves" --with ownership|repair
rai start correction --goal "fix the highest-risk review findings and verify the patch wave" --with repair|regression
rai fix --goal "fix the highest-risk review findings and verify the patch wave"
rai dashboard
```

When these flows run, Raiola keeps the same findings registry and correction control-plane artifacts alive across review, repo audit, monorepo review, and fix work, and the trust lane projects that same status model into release-control artifacts for verify-work and ship-readiness:

- `.workflow/reports/findings-registry.json`
- `.workflow/reports/correction-control.json`
- `.workflow/reports/correction-control.md`
- `.workflow/reports/release-control.json`
- `.workflow/reports/release-control.md`

The dashboard then surfaces that state through **Review Control Room**, **Correction Board**, **Large Repo Board**, **Verify Status Board**, and **Ship Readiness Board** panels.

### Large monorepo

Best when package scope, impacted tests, and safe parallelism matter more than a single-file patch loop.

```bash
rai help team
rai start monorepo --goal "review and patch the top-risk monorepo subsystem" --profile deep --with shard|ownership|parallel
rai monorepo
rai audit-repo --mode oneshot --goal "run a full repo audit and fix the highest risk issues"
rai team run --adapter hybrid --activation-text "parallel yap" --write-scope packages/app-one,packages/app-two
rai team collect --patch-first
rai sessions
```

### Frontend product surface

Best when the work is a real UI surface and you want the product lane to stay connected from identification through browser proof.

```bash
rai help frontend
rai start recommend --goal "ship the premium dashboard surface"
rai start frontend --goal "ship the premium dashboard surface" --profile deep --with trust|browser|docs
rai dashboard
```

## First-day checklist

```bash
rai setup
rai help lifecycle
rai help bundles
rai start recommend --goal "fix the highest-risk review findings and verify the patch wave"
rai start --goal "land the next safe slice"
rai doctor --strict
rai hud --compact
rai next
```

`rai doctor --strict` now also reports setup compatibility signals such as existing hook managers, CI workflows, linter surfaces, and managed-file overlaps in addition to the host prerequisites such as Git, ripgrep, and platform-specific browser opener helpers. `rai health --strict` stays reserved for blocking workflow/runtime issues.

By default the install flow patches `.gitignore` so `.workflow/` stays out of normal diff review while portable `.agents/` plugin assets remain shareable. Use `rai uninstall --json` when you need deterministic rollback; generated `.workflow/` runtime artifacts are cleaned while `docs/workflow/` stays preserved unless `--purge-docs` is explicitly requested.

## Need the full shell?

```bash
rai update --script-profile core
rai help categories
rai help frontend
rai help trust
rai help all
```

## Plugin-Style Usage

This source repository also ships a portable agent pack:

- `AGENTS.md`
- `skills/*`
- `.claude/commands/*`
- `agents/*`
- `references/*`
- native Codex hook assets under `.codex/hooks/*` and an opt-in `.codex/hooks.json` registration when enabled

## Frontend-first start lanes

Use `rai start recommend` when the UI goal could be delivery, refactor, polish, or release signoff. The harness now inspects the frontend surface first and can recommend `frontend`, `frontend-refactor`, `frontend-polish`, or `frontend-ship` together with `surface`, `design-system`, and `state` overlays.

## Proof-first verification

Use these commands when you need runtime evidence instead of static analysis alone:

```bash
rai api-surface --base-url http://localhost:3000 --json
rai verify-browser --adapter auto --require-proof --url http://localhost:3000 --json
```

`api-surface` can now attach live HTTP probe evidence, and `verify-browser` records whether the result is smoke-only evidence or real browser proof.
