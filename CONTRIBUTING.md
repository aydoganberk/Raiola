# Contributing

Thanks for contributing to `raiola`.

The public shell is `rai`. New docs, examples, screenshots, and tests should use `rai` as the command surface. Compatibility aliases should only appear when a change is explicitly about backward-compatibility behavior.

## Product principles

- Keep markdown canonical. Do not move source-of-truth workflow state into hidden runtime files.
- Prefer additive wrappers and migrations over breaking installed repos.
- Treat repo-local install quality as a product surface, not just a packaging detail.
- Keep verification close to the feature. New command surfaces should ship with tests.
- When behavior changes, update the docs that operators actually read.

## Local setup

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

## Before opening a PR

- Run `npm test`.
- Run `npm run pack:smoke`.
- If routing, help text, or command output changed, update the related golden snapshots and command docs.
- If install behavior changed, smoke the setup flow against a temp repo.
- If canonical markdown or cache semantics changed, update [docs/architecture.md](./docs/architecture.md) or [docs/performance.md](./docs/performance.md) as needed.
- If the README, product positioning, or user-facing examples changed, keep the naming consistent with `raiola` and `rai`.

## Change guidance

### CLI and workflow behavior

- Preserve `workflow:*` compatibility unless the change intentionally includes a migration path.
- Prefer editing the product shell and wrappers in ways that keep installed repos stable.
- Keep `doctor`, `health`, and setup/update flows safe-by-default.

### Quick, full, and team lanes

- Use `rai quick` changes for quick-mode surfaces.
- Use `rai milestone` and canonical workflow docs for full-workflow changes.
- Use `rai team` changes for orchestration, routing, and runtime fan-out behavior.
- Use lifecycle report tests when editing review, ship, PR brief, release notes, or session-report outputs.

### Docs and product messaging

- README should stay product-oriented and onboarding-friendly.
- Command docs should stay exhaustive and operational.
- Skill docs should keep a short daily-use layer and a deeper contract layer.
- Prefer one naming standard: product = `raiola`, shell = `rai`.

## Testing expectations

- Add or update tests for every new command surface.
- Add regression coverage for compatibility-sensitive behavior.
- If a feature produces files, assert on the artifact path or emitted content shape.
- If help text changes, keep the command reference and golden help snapshots in sync.

## Release process

- Keep `CHANGELOG.md` updated under `## Unreleased` as normal work lands.
- Use the `Cut Release` GitHub Actions workflow to bump version, rewrite the embedded product version, roll the changelog section, create the release commit, and push the tag.
- The tag-driven `Release` workflow is the only path that should publish `raiola` to npm.
- During first publish or while trusted publishing is not configured on npm, keep the `NPM_TOKEN` repository secret available as the publish fallback.
