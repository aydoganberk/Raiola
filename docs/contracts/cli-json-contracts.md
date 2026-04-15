# CLI JSON Contracts

Raiola is still published as `0.x`, but the supported machine-integration surface is now versioned independently from npm package semver.

## What is stable

The supported automation surface is the `--json` output of these commands plus the installed `.workflow/*.json` manifests:

- `rai start --json`
- `rai do --json`
- `rai repo-proof --json`
- `rai api-surface --json`
- `rai verify-browser --json`
- `rai doctor --json`
- `rai setup --dry-run --json`
- `rai uninstall --json`

Each supported payload now includes these top-level fields:

- `schema`
- `contractVersion`
- `stability`
- `summary`

Human-readable console output and markdown summaries are intentionally not a stable integration contract.

For `rai verify-browser --json`, consumers should treat `proofStatus=verified` together with `execution.realScreenshot=true` and `execution.realAccessibilityTree=true` as the strongest browser-proof contract.

## Current contract version

- CLI contract version: `2026-04`

## Schema registry

The schema ids below are shipped in `schemas/` and are also advertised inside `.workflow/product-manifest.json` under `artifactSchemas`.

- `raiola/start-plan/v1`
- `raiola/do-route/v1`
- `raiola/repo-proof/v1`
- `raiola/api-surface/v2`
- `raiola/api-surface-runtime/v1`
- `raiola/verify-browser/v2`
- `raiola/product-manifest/v2`
- `raiola/setup-plan/v1`
- `raiola/install-compatibility/v1`
- `raiola/doctor-report/v1`
- `raiola/uninstall-report/v1`
- `raiola/generated-artifacts/v1`
- `raiola/frontend-control-room/v1`

## Compatibility rule

Breaking changes to the machine-readable payload must ship under a new schema id or a new contract version. Consumers should key on `schema` first and treat `contractVersion` as the release train for the schema set.
