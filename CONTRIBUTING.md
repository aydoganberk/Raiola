# Contributing

Thanks for contributing to `raiola`.

Raiola is a product repo, not just a script collection. Changes here affect the public shell, repo-local installers, canonical workflow files, runtime mirrors, and the generated surfaces people rely on day to day.

## Naming Rules

- Use `rai` for user-facing commands in docs, screenshots, help text, and tests.
- Use `raiola` when referring to the package, product, or published npm artifact.
- Use `raiola-on` only for the blank-state onboarding entry.
- Keep `raiola:*` for repo-local npm fallback scripts.
- Do not introduce new user-facing references to retired names such as `cwf` or `codex-workflow`.

Legacy names are still allowed in migration, repair, setup, update, and uninstall code when they exist only to keep installed repos moving forward safely.

## Product Principles

- Keep markdown canonical. Do not move source-of-truth workflow state into hidden runtime files.
- Treat install, update, repair, and uninstall quality as product surfaces.
- Prefer additive wrappers and migrations over breaking installed repos.
- Keep verification close to the feature. New command surfaces should ship with tests.
- Keep drift low between `rai help`, `docs/commands.md`, README examples, and golden snapshots.
- When behavior changes, update the docs people actually read, not only the implementation.

## Local Setup

```bash
npm test
npm run pack:smoke
node bin/rai.js help
```

Recommended extra verification for product-surface changes:

```bash
node scripts/workflow/roadmap_audit.js --assert --json
node scripts/workflow/setup.js --target /tmp/raiola-smoke --skip-verify
```

If you touched installer behavior, also smoke the repo-local shell in the temp target:

```bash
node /tmp/raiola-smoke/bin/rai.js help
node /tmp/raiola-smoke/bin/raiola-on.js next --json
```

## Where Changes Usually Belong

### Product shell and command routing

- Edit `bin/` and `scripts/cli/` for public command behavior.
- Keep `rai help` output aligned with README and `docs/commands.md`.
- Preserve `raiola:*` compatibility unless the change intentionally includes a migration path.

### Installer and migration behavior

- Edit `scripts/workflow/setup.js`, `install_common.js`, `update.js`, `repair.js`, and `uninstall.js` together when a change affects installed repos.
- Keep setup/update/repair safe-by-default.
- If you remove or rename anything user-facing, make sure older installs can still be repaired or upgraded cleanly.

### Canonical workflow state

- Use `docs/workflow/` for full-workflow source-of-truth changes.
- Use `.workflow/quick/` semantics for quick-lane changes.
- Use `.workflow/orchestration/` semantics for Team Lite changes.
- Do not make runtime JSON the only contract for a feature that should survive pause and resume.

### Review, verification, and generated artifacts

- Use artifact-path assertions when a command writes files.
- Keep report formats stable unless the change intentionally revs the contract.
- If shell or browser verification behavior changes, keep evidence output explicit and inspectable.

### Docs and product messaging

- README should stay product-oriented, onboarding-friendly, and accurate to the current shipped surface.
- `docs/commands.md` should stay exhaustive.
- `docs/getting-started.md` should stay short and practical.
- Skill docs should preserve a short daily-use layer plus a deeper contract layer.

## Before Opening A PR

- Run `npm test`.
- Run `npm run pack:smoke`.
- If help text or command output changed, update the related golden snapshots.
- If command coverage changed, update `docs/commands.md`.
- If onboarding, positioning, or naming changed, update README and keep `rai` / `raiola` / `raiola-on` usage consistent.
- If install behavior changed, smoke the setup flow against a temp repo.
- If canonical markdown or cache semantics changed, update [docs/architecture.md](./docs/architecture.md) or [docs/performance.md](./docs/performance.md) as needed.

## Testing Expectations

- Add or update tests for every new command surface.
- Add regression coverage for compatibility-sensitive behavior.
- If a feature produces files, assert on the artifact path or emitted content shape.
- If help text changes, keep the command reference and golden help snapshots in sync.
- If setup/update/uninstall behavior changes, add or update install-surface tests.

## Release Process

- Keep `CHANGELOG.md` updated under `## Unreleased`.
- Use the `Cut Release` GitHub Actions workflow to bump version, rewrite the embedded product version, roll the changelog section, create the release commit, and push the tag.
- The tag-driven `Release` workflow is the only path that should publish `raiola` to npm.
- During first publish or while trusted publishing is not configured on npm, keep the `NPM_TOKEN` repository secret available as the publish fallback.
