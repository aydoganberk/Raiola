# Changelog

Primary shell note: changelog command references are normalized to the current `rai` shell and `raiola` package surface to avoid naming drift after the rebrand.

## Unreleased

_No unreleased changes yet._

## 0.4.1 - 2026-04-10

- Hardened cross-platform release smoke coverage so Windows CI now tolerates `npm.cmd`, CRLF line endings, and platform-specific fake worker binaries in the test suite.
- Trimmed root-level planning and redesign markdown so the shipped repo surface stays focused on product docs and runtime assets.
- Refined the npm release bootstrap path for trusted publishing and documented the first-publish trust setup more clearly for maintainers.

## 0.4.0 - 2026-04-10

- Added a portable agent pack with root `AGENTS.md`, `.claude-plugin` metadata, real session-start hook assets, role personas, and reusable review/testing/security/accessibility reference checklists.
- Added a split Raiola skill pack so agents can discover focused entrypoints such as `using-raiola`, lifecycle, quick-lane, closeout, frontend, monorepo, team orchestration, and code simplification instead of loading one oversized skill.
- Added a lightweight workflow lifecycle facade across the CLI and Claude command surface with `rai spec`, `rai plan`, `rai build`, `rai test`, `rai review`, `rai code-simplify`, and `rai ship`, plus profile-aware install/doctor/repair/uninstall support for the new runtime surface.
- Updated GitHub Actions workflows to Node 24-ready action majors and moved the supported repo runtime baseline to Node 22, with CI coverage on Node 22 and 24.
- Refreshed GitHub-facing docs and package metadata around the `raiola` brand, the primary `rai` shell, and the current product surface.
- Added a lighter `core` workflow script profile and made `rai setup` default to it on fresh installs to reduce package.json churn during pilot adoption.
- Added a focused `pilot` install profile, made `rai setup` default to it, and taught `rai help` plus command routing to stay profile-aware inside repo-local installs.
- Added runtime-surface pruning during profile downgrades so `rai update --script-profile pilot` removes stale entrypoints and legacy npm aliases instead of only adding new files.
- Added installer source-root metadata so repo-local `rai update` can keep working after setup instead of depending on the source repo being the active working tree.
- Added automatic `.gitignore` hygiene for `.workflow/` and `.agents/`, plus doctor/repair coverage for missing runtime ignore entries.
- Reduced maintenance pressure by extracting common argument, table, and preference helpers out of `scripts/workflow/common.js`.
- Split oversized Codex control, team runtime, and UI-direction modules into dedicated catalog/packet/state/model helpers to lower entrypoint complexity.
- Added runtime guardrails that prune stale task references from persisted team state before they can skew summaries or merge operations.
- Split remaining shared workflow helpers into dedicated path, memory, reference, and validation modules to shrink `common.js`.
- Split design intelligence into profile and builder layers, and reduced the team runtime CLI to a thinner entrypoint over core/supervisor modules.

## 0.3.1 - 2026-04-07

- Fixed command-reference drift so the documented `rai` surface matches the shipped CLI, including `rai review-tasks`.
- Added an explicit publish whitelist, `.npmignore`, and a tarball smoke-install script to keep the npm package focused on runtime assets.
- Declared the then-current supported Node.js baseline (`>=20`) and added repo-local `.nvmrc`.
- Expanded runtime prerequisite diagnostics in `doctor` and `health`, and reduced child-process `node` PATH coupling by using `process.execPath`.
- Added cross-platform install/release workflows, smoke-install checks, and repository governance files (`SECURITY.md`, `CODEOWNERS`).
- Reduced maintenance blast radius by extracting workflow-control, milestone seed content, and delegation runtime logic into dedicated modules.

## 0.3.0 - 2026-04-06

- Added multilingual intent grounding and deterministic capability matching for major non-English prompt surfaces.
- Added `rai ui-direction` plus `design_intelligence.js` to generate taste-aware frontend direction packs before implementation.
- Added `rai review-orchestrate` and review wave planning for package/persona-based deep review on large repos.
- Added `rai monorepo` to generate package-aware write scopes, review shards, verify plans, and performance risk notes.
- Added Codex prompt packs under `rai codex promptpack` so CLI and app sessions can inherit route, verify, UI, and monorepo/review context instantly.
- Hardened `verify-shell` with shell fallback so CI and agent hosts no longer require `/bin/zsh`.
- Refreshed product docs to cover the new commands and runtime artifacts.

## 0.2.0 - 2026-04-04

- Added the `rai` product shell with install, daily-ops, lifecycle, quick-mode, and benchmark commands.
- Added quick mode canonical artifacts under `.workflow/quick/`.
- Added Team Lite orchestration canonical artifacts under `.workflow/orchestration/`.
- Added review-ready, ship-ready, PR brief, release notes, and session report outputs.
- Added hot-path cache modules, packet snapshot caching, perf metrics capture, and repo fs indexing.
- Added product documentation for getting started, commands, architecture, and performance.

## 0.1.0

- Initial workflow kernel and markdown-canonical control plane.

