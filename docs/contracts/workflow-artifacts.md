# Workflow Artifact Contracts

This page documents the installed `.workflow/` contract that team automation and CI should rely on.

## Installed compatibility anchor

`rai setup` now writes `.workflow/product-manifest.json` with:

- install metadata
- managed runtime file list
- `cliContractVersion`
- `artifactSchemas`
- `generatedArtifacts`

That file is the compatibility anchor for update and uninstall flows.

## Setup compatibility lane

Before mutating a repo, use:

```bash
rai setup --dry-run --json
```

The dry-run payload includes:

- `compatibility.verdict`
- detected hook managers and linters
- CI workflow presence
- package script collisions
- managed file overlaps
- rollback command

## Runtime proof artifacts

Proof-oriented commands now distinguish static analysis from live evidence:

```bash
rai api-surface --base-url http://localhost:3000 --json
rai verify-browser --adapter auto --require-proof --url http://localhost:3000 --json
```

`api-surface` can attach `runtimeVerification`, and `verify-browser` now records whether the result is smoke-only evidence or real browser proof. When Playwright is installed in the target repo, Raiola resolves that repo-local runtime and stores a real screenshot plus accessibility tree.

## Rollback and cleanup

`rai uninstall` now uses the installed manifest's `generatedArtifacts` section when available and falls back to the packaged cleanup defaults when it is missing.

That makes `.workflow/` cleanup deterministic for:

- runtime reports
- verifications
- cache
- quick-session state
- install report
- other generated workflow state

Canonical docs under `docs/workflow/` are preserved unless `--purge-docs` is explicitly requested.
