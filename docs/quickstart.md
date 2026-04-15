# Quickstart

Use this page when you want Raiola to feel small on day one.

The starter surface is only four commands:

- `rai start`
- `rai do`
- `rai next`
- `rai verify`

Everything else is there when the repo shape demands it, but you do not need the full shell to become productive.

## Existing repo in five minutes

```bash
npx raiola setup --dry-run --json
npx raiola setup
rai help quickstart
rai doctor --strict
rai start recommend --goal "fix the next safe slice and verify it"
rai next
```

`rai setup --dry-run` is the safe preview step before Raiola touches `package.json`, `.workflow/`, or the repo-local agent layer.

## Blank repo in five minutes

```bash
npx raiola setup
rai on next
rai milestone --id M1 --name "Initial slice" --goal "Land the first safe slice"
rai start --goal "land the first safe slice"
rai checkpoint --next "Resume from the next recommended step"
```

## Frontend repo

```bash
rai start recommend --goal "ship the dashboard surface"
rai start frontend --goal "ship the dashboard surface" --with browser|docs
rai verify-browser --adapter auto --require-proof --url http://localhost:3000
```

For real browser proof instead of smoke-only HTML evidence, install `playwright` or `@playwright/test` in the target repo. Raiola resolves the repo-local Playwright runtime and stores a real screenshot plus accessibility tree when it is available.

## Large monorepo

```bash
rai start monorepo --goal "review and patch the top-risk subsystem"
rai workspace-impact --json
rai verify --goal "verify the correction wave"
```

## External repo snapshot

Use this when you want to validate a local clone or tarball without changing directories first.

```bash
rai repo-proof --repo ../candidate-repo --json
rai api-surface --repo ../candidate-repo --base-url http://localhost:3000 --json
rai audit-repo --repo ../candidate-repo --goal "audit the snapshot" --json
```

## Stay narrow by default

Use these lanes first:

- `rai start` for the lane
- `rai do` for natural-language routing
- `rai next` for continuity
- `rai verify` for merge or ship confidence

Open the deeper packs only when needed:

- `rai help review`
- `rai help frontend`
- `rai help monorepo`
- `rai help team`
- `rai help planes`

## Rollback

```bash
rai uninstall --json
```

Uninstall keeps `docs/workflow/` by default and cleans generated `.workflow/` runtime artifacts using the installed manifest when available.
