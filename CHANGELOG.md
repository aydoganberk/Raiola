## 0.4.8

- Added import-graph-aware monorepo intelligence so blast radius can expand through workspace imports and cross-file consumers instead of package boundaries alone.
- Upgraded frontend component inventory with export, prop-interface, and consumer counting signals plus package-alias consumer inference for shared UI packages.
- Added delta-based continuity checkpoints with milestone snapshots, JSON-patch-style operations, and resumable checkpoint artifacts under `.workflow/runtime/checkpoints/`.
- Upgraded file indexing to persistent cache-first behavior under `.workflow/cache/file-index.json` with fast git-status reuse when the repo is unchanged.
- Added design token export pipeline outputs for CSS custom properties, Figma Variables JSON, and Tailwind partials from taste-profile generation.
- Added content-addressable evidence objects and structured explainability traces for downstream agent-readable reasoning and stale-evidence inspection.
- Added package-level repo-config override discovery for monorepo package-local `.workflow/package-config.json` files.

# Changelog
## Unreleased

- formalized lifecycle transitions with a repo-visible lifecycle FSM and recommended next-state output
- added an agent-agnostic runtime contract surface that detects Codex, Claude Code, Cursor, and Aider footprints
- upgraded browser verification to emit an accessibility tree artifact and use Playwright capture when available
- strengthened worktree isolation by optionally symlinking shared node_modules into isolated worker checkouts


Primary shell note: changelog command references are normalized to the current `rai` shell and `raiola` package surface to avoid naming drift after the rebrand.

## Unreleased

- Added a native Codex operator layer with `rai codex operator`, `rai codex cockpit`, `rai codex mission`, `rai codex telemetry`, managed requirements export, app-server / Agents SDK scaffolds, operator evals, and new installable operator skills.
- Added reusable Codex execution capsules under `.workflow/runtime/codex-control/missions/` so high-stakes tasks now get a mission charter, recovery file, launcher, trust/release gates, and a concrete resume anchor instead of living only as ephemeral session state.

- Added a converged control-plane packet surface so Change Control now publishes `control-plane-packet.json` beside repo status, export manifests, CI gate output, and GitHub output maps.
- Expanded `rai release-control` to materialize Explainability as part of the supporting ship surfaces and to converge the release lane until continuity/export links stabilize.
- Expanded Handoff OS so continuity bundles now carry trust/change-control/explainability decision basis, linked control-plane summaries, and external resume links back to repo status, export manifest, and the control-plane packet.
- Expanded Measurement / ROI so it also reports control-plane integrity signals such as packet presence and explainability visibility.

- Hardened control-plane artifact persistence so persisted report JSON now carries its own artifact/runtime paths instead of leaving downstream publish surfaces to reconstruct them.
- Expanded `rai release-control` so the change-control lane materializes Handoff OS, Measurement / ROI, Lifecycle Center, Team Control Room, and Autopilot as supporting ship surfaces before exporting release artifacts.
- Fixed control-plane publish self-references so `repo-status.json`, `export-manifest.json`, and GitHub output paths stay stable and machine-readable across the full export set.
- Added `rai operate`, a unified engineering operating center that ranks the core planes, chooses the active question, compresses the command surface, and preserves publish readiness in one repo-native entry.
- Expanded `rai repo-config` with opinionated stack packs and preferred-plane ordering for Next.js apps, Express APIs, Cloudflare Workers, Supabase/Stripe repos, monorepos, design-system-heavy frontends, and repo-native CLIs.
- Expanded the dashboard, CLI help, package surface, and CI control-plane job so Operating Center artifacts, stack-pack defaults, and plane refreshes show up in the shipped product instead of living as hidden internals.
- Added `rai control-plane-publish`, a thin export bridge above Change Control that regenerates GitHub PR comments, check summaries, step summaries, GitHub outputs, status badge JSON, issue-tracker JSON, Slack payloads, and export manifests from the latest release gate.
- Expanded Change Control, Autopilot, Handoff OS, Team Control Room, Measurement / ROI, Explainability, and Lifecycle Center so publish coverage, PR-event routines, continuity bundles, mailbox/timeline activity, confidence breakdowns, repo-config drift, and export drift all show up in first-class product surfaces.
- Added a dedicated GitHub Actions control-plane publish job that emits the repo-native reports, uploads `.workflow/exports/*`, writes step summaries/outputs, and keeps a sticky PR comment synced from the release-control state.
- Added repo-native control planes: `rai repo-config`, `rai trust`, `rai release-control`, `rai autopilot`, `rai handoff`, `rai team-control`, `rai measure`, `rai explain`, and `rai lifecycle`, with dedicated `.workflow/reports/*` artifacts and runtime mirrors.
- Added stack-pack detection and repo-native defaults so bundle/profile/add-on selection, required verifications, automation preferences, and handoff standards can be configured once per repo through `.workflow/repo-config.json`.
- Expanded the dashboard and release path so Trust Center, Change Control, Handoff OS, Team Control Room, Measurement / ROI, Explainability, Lifecycle Center, and external GitHub/CI/Slack exports are visible from the shipped product surface.
- Added `rai start`, a productized workflow-bundle entry that groups overlapping audit/review/fix/verify/frontend/closeout commands into structured plans with reusable `.workflow/runtime/start-plan.{json,md}` artifacts.
- Added a second-round guided start layer with `rai start recommend`, bundle candidate scoring, `speed|balanced|deep` start profiles, and `trust|docs|handoff|parallel|browser|recommended` add-ons so the same entry can scale from a lean slice to a fuller product lane.
- Expanded command planning so `rai do`, monorepo mode, frontend lanes, and dashboard surfaces now share the same bundle metadata, grouped command families, starter-command guidance, and richer expanded-start recommendations.
- Improved frontend identification with routing detection, surface inventory, planning signals, and recommended command packs so frontend planning and review flows become easier to start correctly, even when generic ship wording overlaps with frontend product work.
- Updated installer profiles, docs, help output, benchmark coverage, dashboard rendering, and tests so the bundle layer is part of the shipped product surface rather than a hidden add-on.
- Added a frontend-focused third round that splits UI work into `frontend-delivery`, `frontend-review`, `frontend-refactor`, `frontend-polish`, and `frontend-ship-readiness`, with `surface`, `design-system`, and `state` overlays carried through `rai start`, `rai do`, and the dashboard control room.

## 0.4.6 - 2026-04-11

- Cut the first clean release after the repository history rewrite so future published artifacts point at commit metadata with the GitHub `noreply` address instead of the old personal Gmail address.
- Reset the release line after removing legacy public tags, making `0.4.6` the first release intended to ride on the sanitized public history.

## 0.4.5 - 2026-04-11

- Fixed the release workflow's tag-to-version guard so shell interpolation no longer breaks the `v<version>` comparison before trusted publishing runs.
- Moved the guard to a quoted Node heredoc, which keeps the release runner from mangling JavaScript template literals during the publish gate.

## 0.4.4 - 2026-04-11

- Added the first post-bootstrap release cut after the manual `0.4.3` npm publish so GitHub Actions can resume versioned releases without colliding on an already-published package version.
- Kept the trusted-publishing release path aligned with npm package settings by promoting the next automated release to `0.4.4`.

## 0.4.3 - 2026-04-11

- Fixed the npm publish workflow so trusted-publishing releases no longer rely on a brittle global `npm install --global npm@11` upgrade step on GitHub runners.
- Switched the release job to invoke `npm@11.5.1` directly through `npx`, which matches npm's required publish CLI level while keeping the release runner environment stable.

## 0.4.2 - 2026-04-10

- Fixed the remaining Windows-only release smoke failures by using shell-backed `npm.cmd` launches in the phase 1 install tests and by normalizing uninstall path assertions across path separators.
- Hardened runtime Windows compatibility for repo-local Codex detection and live worker launch, plus MCP registry inspection, so `.cmd`-backed binaries work in smoke and team-runtime scenarios.
- Guarded `ensure-isolation` against source/destination self-copy cases when syncing canonical workflow files into worktrees on Windows.

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
