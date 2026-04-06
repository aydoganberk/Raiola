# Changelog

## 0.3.1 - 2026-04-07

- Fixed command-reference drift so the documented `cwf` surface matches the shipped CLI, including `cwf review-tasks`.
- Added an explicit publish whitelist, `.npmignore`, and a tarball smoke-install script to keep the npm package focused on runtime assets.
- Declared the supported Node.js baseline (`>=20`) and added repo-local `.nvmrc`.
- Expanded runtime prerequisite diagnostics in `doctor` and `health`, and reduced child-process `node` PATH coupling by using `process.execPath`.
- Added cross-platform install/release workflows, smoke-install checks, and repository governance files (`SECURITY.md`, `CODEOWNERS`).
- Reduced maintenance blast radius by extracting workflow-control, milestone seed content, and delegation runtime logic into dedicated modules.

## 0.3.0 - 2026-04-06

- Added multilingual intent grounding and deterministic capability matching for major non-English prompt surfaces.
- Added `cwf ui-direction` plus `design_intelligence.js` to generate taste-aware frontend direction packs before implementation.
- Added `cwf review-orchestrate` and review wave planning for package/persona-based deep review on large repos.
- Added `cwf monorepo` to generate package-aware write scopes, review shards, verify plans, and performance risk notes.
- Added Codex prompt packs under `cwf codex promptpack` so CLI and app sessions can inherit route, verify, UI, and monorepo/review context instantly.
- Hardened `verify-shell` with shell fallback so CI and agent hosts no longer require `/bin/zsh`.
- Refreshed product docs to cover the new commands and runtime artifacts.

## 0.2.0 - 2026-04-04

- Added the `cwf` product shell with install, daily-ops, lifecycle, quick-mode, and benchmark commands.
- Added quick mode canonical artifacts under `.workflow/quick/`.
- Added Team Lite orchestration canonical artifacts under `.workflow/orchestration/`.
- Added review-ready, ship-ready, PR brief, release notes, and session report outputs.
- Added hot-path cache modules, packet snapshot caching, perf metrics capture, and repo fs indexing.
- Added product documentation for getting started, commands, architecture, and performance.

## 0.1.0

- Initial workflow kernel and markdown-canonical control plane.
