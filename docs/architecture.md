# Architecture

## Canonical state

The product keeps markdown canonical.

Full workflow canonical files live under `docs/workflow/` or the active named workstream root.

Quick mode canonical files live under `.workflow/quick/*.md`.

Team Lite orchestration canonical files live under `.workflow/orchestration/PLAN.md`, `STATUS.md`, `WAVES.md`, and `RESULTS.md`.

## Non-canonical runtime state

These surfaces are cache, index, telemetry, verification, or operator helpers only:

- `.workflow/state.json`
- `.workflow/runtime/*.json`
- `.workflow/runtime/*.md`
- `.workflow/packet-state.json`
- `.workflow/VERSION.md`
- `.workflow/product-manifest.json`
- `.workflow/quick/session.json`
- `.workflow/orchestration/state.json`
- `.workflow/orchestration/runtime/*.json`
- `.workflow/cache/*`
- `.workflow/fs-index.json`
- `.workflow/verifications/*`

Deleting them may reduce performance or resume convenience, but it must not break workflow semantics.

`cwf update` uses `.workflow/VERSION.md` as the visible product-version marker for migrate and refresh decisions.

## Control-plane layers

- `cwf` is the product shell.
- installed repos also get `bin/cwf.js` and `scripts/cli/cwf.js` as a repo-local CLI fallback.
- `workflow:*` scripts remain backward-compatible.
- `common.js` is still the facade for legacy callers.
- newer modules in `scripts/workflow/io`, `markdown`, `packet`, and `perf` take over hot-path responsibilities incrementally.
- `runtime_collector.js` is the shared in-process collector for `launch`, `hud`, `manager`, and the resume prompt surface.
- `repair.js` separates safe runtime fixes from manual canonical follow-up.
- `team_runtime.js` adds adapter-backed dispatch/monitor/collect on top of the canonical orchestration contract.
- `codex_control.js` adds the safe Codex control-plane layer with diff, journal, rollback, and repo-derived role generation.
- `do.js`, `note.js`, `thread.js`, and `backlog.js` add the daily intent/capture surfaces.
- `questions.js`, `claims.js`, `secure_phase.js`, `packet.js`, and `evidence.js` add the trust, packet-lock, and provenance layer.
- `policy.js`, `approvals.js`, `hooks.js`, `mcp.js`, `notify.js`, `daemon.js`, `gc.js`, `incident.js`, `fleet.js`, and `sessions.js` add the governance, integration, scale, and operator-center layer.
- `cwf doctor` audits both canonical workflow health and install-surface integrity, including package scripts, runtime files, skill installation, and the visible version marker.

## Workflow lanes

- Full workflow: milestone lifecycle with plan and audit gates.
- Quick mode: lighter artifact set for narrow tasks.
- Team Lite: explicit parallel routing with disjoint write-scope safety.
- Lifecycle closeout: review, ship, PR brief, release notes, session report.

## Runtime companion layer

- `cwf launch` and `cwf codex` provide strong-start orientation.
- `cwf codex` also manages the virtual `.codex` surface via the repo-local safe mirror under `.workflow/runtime/codex-control/`.
- `cwf manager` and `cwf hud --watch` provide live operator visibility.
- `cwf explore`, `cwf verify-shell`, and `cwf verify-browser` provide purpose-built exploration and evidence capture.
- `cwf route`, `cwf stats`, `cwf profile`, and `cwf workspaces` provide operator routing, telemetry, and workspace center surfaces.
- `cwf team mailbox`, `cwf team timeline`, and `cwf patch-review` expose runtime collect/merge state directly in-product.
