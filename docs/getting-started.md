# Getting Started

## Install into a repo

From a published package:

```bash
npx codex-workflow-kit setup
```

From this repository:

```bash
node bin/cwf.js setup --target /path/to/target-repo
```

## First commands

```bash
cwf doctor --strict
cwf hud --compact
cwf next
```

If `cwf` is not on your PATH yet, the installed repo still includes a local fallback:

```bash
node bin/cwf.js doctor --strict
```

## Open a milestone

```bash
cwf milestone --id M1 --name "Initial setup" --goal "Land the first workflow-backed slice" --profile standard --automation manual
```

## Run a quick task

```bash
cwf quick start --goal "Fix a small issue"
```

## Use Team Lite

```bash
cwf team start --activation-text "parallel yap" --write-scope src/foo.ts,tests/foo.test.js
```

## Generate closeout packages

```bash
cwf review
cwf ship
```
