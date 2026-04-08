# Getting Started

## Install into a repo

Supported runtime baseline:

- Node.js `>=22`
- Full support on macOS and Linux
- Smoke-tested install/help flows on Windows

The primary shell is `rai`, the published package is `raiola`, and legacy aliases such as `cwf` still exist for compatibility.

From a published package:

```bash
npx raiola setup
```

Fresh setup defaults to the focused `pilot` workflow profile. This keeps package.json and the repo-local `rai` shell leaner on first install. Use `--script-profile core` for the full shell with curated npm aliases, or `--script-profile full` for every legacy `workflow:*` alias on day one.

From this repository:

```bash
node bin/rai.js setup --target /path/to/target-repo
```

If `rai` is not on your PATH yet, the installed repo still includes a local fallback:

```bash
node bin/rai.js help
node bin/rai.js doctor --strict
```

## Choose your starting path

Use `rai help` to start from the three golden flows. Pick the one that matches how your repo usually works.

### Solo maintainer

Best for a single operator moving one safe slice at a time.

```bash
rai help solo
rai doctor --strict
rai milestone --id M1 --name "Initial setup" --goal "Land the first workflow-backed slice"
rai do "land the next safe slice"
rai next
```

### Review-heavy team

Best when the repo already has changes and your main job is risk, regressions, and closeout quality.

```bash
rai help review
rai route --goal "review the current diff" --why
rai review --heatmap
rai ui-review --url ./preview.html
rai ship-readiness
```

### Large monorepo

Best when package scope, impacted tests, and safe parallelism matter more than a single-file patch loop.

```bash
rai help team
rai monorepo
rai team run --adapter hybrid --activation-text "parallel yap" --write-scope packages/app-one,packages/app-two
rai team collect --patch-first
rai sessions
```

## First-day checklist

```bash
rai setup
rai doctor --strict
rai hud --compact
rai next
```

`rai doctor --strict` will also verify host prerequisites such as Git, ripgrep, and platform-specific browser opener helpers before you start depending on the runtime. `rai health --strict` stays reserved for blocking workflow/runtime issues.

By default the install flow also patches `.gitignore` with workflow runtime entries so `.workflow/` and `.agents/` stay out of normal diff review.

## Need the full shell?

```bash
rai update --script-profile core
rai help categories
rai help frontend
rai help trust
rai help all
```
