# Contributing

## Principles

- Keep markdown canonical. Do not introduce hidden source-of-truth state.
- Prefer wrapper-first changes over breaking the current runtime.
- Preserve `workflow:*` backward compatibility unless a migration note explicitly says otherwise.
- Add tests for every new command surface and for any compatibility-sensitive behavior.

## Setup

```bash
npm test
node bin/cwf.js help
```

## Before opening a PR

- Run `npm test`.
- Smoke the product shell on a temp repo with `node scripts/workflow/setup.js --target <tmp> --skip-verify`.
- If command output changed, update the related golden snapshot or command docs.
- If canonical markdown or cache semantics changed, update `docs/architecture.md` or `docs/performance.md`.

## Scope discipline

- Use `cwf quick` changes for quick-mode surfaces.
- Use `cwf team` changes for orchestration/runtime changes.
- Use lifecycle report tests when editing review/ship outputs.

## Documentation

- README should stay product-oriented.
- Skill docs should keep a short daily-use layer and a deeper contract layer.
- New commands need help text and command-reference coverage.
