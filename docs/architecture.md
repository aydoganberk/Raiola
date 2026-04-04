# Architecture

## Canonical state

The product keeps markdown canonical.

Full workflow canonical files live under `docs/workflow/` or the active named workstream root.

Quick mode canonical files live under `.workflow/quick/*.md`.

Team Lite orchestration canonical files live under `.workflow/orchestration/PLAN.md`, `STATUS.md`, `WAVES.md`, and `RESULTS.md`.

## Non-canonical runtime state

These surfaces are cache, index, or HUD helpers only:

- `.workflow/state.json`
- `.workflow/packet-state.json`
- `.workflow/VERSION.md`
- `.workflow/product-manifest.json`
- `.workflow/quick/session.json`
- `.workflow/orchestration/state.json`
- `.workflow/cache/*`
- `.workflow/fs-index.json`

Deleting them may reduce performance or resume convenience, but it must not break workflow semantics.

`cwf update` uses `.workflow/VERSION.md` as the visible product-version marker for migrate and refresh decisions.

## Control-plane layers

- `cwf` is the product shell.
- installed repos also get `bin/cwf.js` and `scripts/cli/cwf.js` as a repo-local CLI fallback.
- `workflow:*` scripts remain backward-compatible.
- `common.js` is still the facade for legacy callers.
- newer modules in `scripts/workflow/io`, `markdown`, `packet`, and `perf` take over hot-path responsibilities incrementally.
- `cwf doctor` audits both canonical workflow health and install-surface integrity, including package scripts, runtime files, skill installation, and the visible version marker.

## Workflow lanes

- Full workflow: milestone lifecycle with plan and audit gates.
- Quick mode: lighter artifact set for narrow tasks.
- Team Lite: explicit parallel routing with disjoint write-scope safety.
- Lifecycle closeout: review, ship, PR brief, release notes, session report.
