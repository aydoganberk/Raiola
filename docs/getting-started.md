# Getting Started

## Install into a repo

Supported runtime baseline:

- Node.js `>=20`
- Full support on macOS and Linux
- Smoke-tested install/help flows on Windows

From a published package:

```bash
npx codex-workflow-kit setup
```

From this repository:

```bash
node bin/cwf.js setup --target /path/to/target-repo
```

If `cwf` is not on your PATH yet, the installed repo still includes a local fallback:

```bash
node bin/cwf.js help
node bin/cwf.js doctor --strict
```

## Choose your starting path

Use `cwf help` to start from the three golden flows. Pick the one that matches how your repo usually works.

### Solo maintainer

Best for a single operator moving one safe slice at a time.

```bash
cwf help solo
cwf doctor --strict
cwf milestone --id M1 --name "Initial setup" --goal "Land the first workflow-backed slice"
cwf do "land the next safe slice"
cwf next
```

### Review-heavy team

Best when the repo already has changes and your main job is risk, regressions, and closeout quality.

```bash
cwf help review
cwf route --goal "review the current diff" --why
cwf review --heatmap
cwf ui-review --url ./preview.html
cwf ship-readiness
```

### Large monorepo

Best when package scope, impacted tests, and safe parallelism matter more than a single-file patch loop.

```bash
cwf help team
cwf monorepo
cwf team run --adapter hybrid --activation-text "parallel yap" --write-scope packages/app-one,packages/app-two
cwf team collect --patch-first
cwf sessions
```

## First-day checklist

```bash
cwf setup
cwf doctor --strict
cwf hud --compact
cwf next
```

`cwf doctor --strict` will also verify host prerequisites such as Git, ripgrep, and platform-specific browser opener helpers before you start depending on the runtime.

## Need the full shell?

```bash
cwf help categories
cwf help frontend
cwf help trust
cwf help all
```
