# Helper canonical map

Wave 5 locks infra helpers to a small canonical surface so migration is the only supported path.

## Canonical modules

| Helper family | Canonical module | Notes |
| --- | --- | --- |
| `readTextIfExists`, `readText`, `writeText`, `writeTextIfChanged`, `ensureDir` | `scripts/workflow/io/fs.js` | Thin canonical entry for file/text helpers. `io/files.js` stays as a compatibility implementation detail. |
| `readJsonIfExists`, `parseJson`, `writeJsonIfChanged` | `scripts/workflow/io/json.js` | All safe JSON reads route through the shared JSON helper. |
| `detectPackageManager`, `quoteShell`, `commandFor` | `scripts/workflow/package/repo.js` | Package-manager detection and workspace command rendering live together. `io/package_manager.js` remains a compatibility re-export. |

## Enforcement

- `tests/no_local_infra_helpers.test.js` fails when a workflow script defines a duplicate helper locally.
- `tests/io_duplicate_guard.test.js` proves the guard catches file-local declarations, not only missing imports.
- `scripts/workflow/duplicate_helper_report.js` inventories duplicate helper declarations for audit and migration sweeps.

## Migration notes

The Wave 5 sweep removed the remaining local duplicates from workflow scripts:

- `readJsonIfExists`: 18 local declarations -> 0
- `readTextIfExists`: 2 local declarations -> 0
- `detectPackageManager`: 3 local declarations -> 0
- `quoteShell`: 2 local declarations -> 0
- `commandFor`: 2 local declarations -> 0

## Rules

1. Do not declare file-local versions of canonical infra helpers.
2. Prefer the canonical module even when the helper body looks trivial.
3. Add a new helper family only when it is shared, documented here, and guarded by tests.
