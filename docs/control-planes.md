# Control Planes

Raiola now groups its strongest capabilities into a smaller number of repo-native product planes.

## Operating Center

`rai operate` is the unified engineering operating center above the other planes. It ranks the current plane board, picks the active question, preserves publish readiness, and tells the operator which command should run next.

It compresses the repo-native product into one entry that answers:

- which plane needs attention first
- which command should run now
- how much capability is being compressed
- whether GitHub / CI / Slack publish surfaces are ready
- which stack packs and preferred planes are shaping the default flow

Artifacts:

- `.workflow/reports/operating-center.{json,md}`
- runtime mirrors under `.workflow/runtime/`

## Repo Config

`rai repo-config` detects stack packs and writes `.workflow/repo-config.json` plus runtime mirrors. The config captures:

- default profile
- trust level
- preferred bundles and add-ons
- required verifications
- handoff standard
- automation preferences
- release-control defaults
- explainability defaults
- external export preferences

This lets `rai start`, `rai do`, `rai profile`, `rai autopilot`, `rai release-control`, and `rai operate` behave like repo-native products instead of generic commands.

Detected stack packs now also surface opinionated defaults for common repo shapes such as Next.js apps, Express APIs, Cloudflare Workers, Supabase/Stripe projects, monorepos, design-system-heavy frontends, and repo-native CLIs. Each pack carries bundle bias, add-on bias, verification bias, automation bias, release bias, handoff standard, trust level, and preferred plane ordering so the repo can describe how it wants to be operated.

## Repo Control Room

`rai repo-control` turns repo shape, package graph hotspots, workstream posture, frontend presence, and Codex follow-through into one repo-wide board.

Artifacts:

- `.workflow/reports/repo-control-room.{json,md}`
- runtime mirrors under `.workflow/runtime/`

## Workspace Impact

`rai workspace-impact` answers the next large-monorepo question directly: what changed, what is now impacted, how wide is the blast radius, and which development waves should verify first?

It summarizes:

- changed and impacted packages
- blast-radius verdicts
- development waves
- write scopes and recommended lane count
- verification order
- workspace mapping gaps

Artifacts:

- `.workflow/reports/workspace-impact.{json,md}`
- runtime mirrors under `.workflow/runtime/`

## Monorepo Control Room

`rai monorepo-control` sits above workspace-impact for large repositories. It combines dependency hubs, wave sequencing, workspace coordination, repo-health posture, and Codex operating hints into one large-monorepo control room.

It is the preferred foreground plane when the repo-config stack pack identifies a broad monorepo, because it gives `rai operate` a repo-native answer to:

- which wave should open next
- where the dependency bottlenecks live
- whether workspace ownership is explicit enough
- whether bounded parallel lanes are safe
- which Codex packet should be launched for the active wave

Artifacts:

- `.workflow/reports/monorepo-control-room.{json,md}`
- runtime mirrors under `.workflow/runtime/`

## Frontend Control Room

`rai frontend-control` turns frontend evidence into a UI-native plane instead of leaving it as isolated heuristics.

It summarizes:

- framework and routing detection
- component inventory and UI-system posture
- browser evidence coverage
- semantic and accessibility gaps
- missing-state and token-drift debt
- design-debt scorecard and next actions

Artifacts:

- `.workflow/reports/frontend-control-room.{json,md}`
- runtime mirrors under `.workflow/runtime/`

## Safety Control Room

`rai safety-control` turns hardening and recovery into one foreground plane before the repo widens into release, automation, or large refactors.

It combines:

- repo-scoped secure-phase findings and top risks
- doctor and health failures that indicate operator drift
- self-healing repair actions and manual repair lanes
- workspace-impact exposure for high-fan-out packages without local verification
- incident memory and the next Codex-native stabilization move

Artifacts:

- `.workflow/reports/safety-control-room.{json,md}`
- `.workflow/runtime/safety-control-room.{json,md}`

## Trust Center

`rai trust` answers one question directly:

> Is this safe to start, merge, and ship?

It combines:

- risk level
- policy issues
- missing evidence
- pending approvals
- plan-readiness gaps
- verification gaps
- residual risks

Artifacts:

- `.workflow/reports/trust-center.json`
- `.workflow/reports/trust-center.md`
- runtime mirrors under `.workflow/runtime/`

## Change Control

`rai release-control` productizes the release and change-management path. It composes verification, ship-readiness, trust, closeout, rollback, explainability, and publish artifacts into one gate, then materializes the supporting ship surfaces so Explainability, Handoff OS, Measurement / ROI, Lifecycle Center, Team Control Room, and Autopilot stay in sync with the current release lane.

It covers:

- prepare the change
- inspect current risk
- verify the change
- pass merge and ship gates
- emit release artifacts
- preserve continuity for the next operator
- keep rollback ready
- export machine-readable status for GitHub/CI/Slack/issue trackers
- publish a machine-readable control-plane packet for downstream consumers

Artifacts:

- `.workflow/reports/change-control.{json,md}`
- refreshed `pr-brief.md`, `release-notes.md`, `session-report.md`, `ship.md`
- `.workflow/exports/github-pr-comment.{md,json}`
- `.workflow/exports/github-check-summary.{md,json}`
- `.workflow/exports/github-actions-step-summary.md`
- `.workflow/exports/github-actions-output.json`
- `.workflow/exports/ci-gate.json`
- `.workflow/exports/repo-status.json`
- `.workflow/exports/status-badge.json`
- `.workflow/exports/issue-tracker.json`
- `.workflow/exports/slack-summary.{txt,json}`
- `.workflow/exports/export-manifest.json`
- `.workflow/exports/control-plane-packet.json`

## Publish Surface

`rai control-plane-publish` is the thin export bridge above Change Control. It preserves stable self-referential paths for repo-status, export-manifest, control-plane-packet, and GitHub outputs so downstream CI consumers can treat the export set as a coherent publish bundle.

Use it when the repo already has a current `.workflow/reports/change-control.json` and you want to:

- regenerate GitHub / CI / Slack exports without rerunning the whole release plane
- append step summaries to `GITHUB_STEP_SUMMARY`
- append machine-readable outputs to `GITHUB_OUTPUT`
- export repo-native environment variables to `GITHUB_ENV`

This makes the control planes feel native inside GitHub Actions instead of only inside the CLI.

## Autopilot

`rai autopilot` turns routine suggestions into one automation-aware surface.

Typical routines include:

- morning summary
- branch-aware start bundle
- pull-request review-lane refresh
- pull-request publish refresh
- correction lane when verification fails
- workflow drift recovery
- CI failure recovery
- team runtime recovery
- inactive thread recovery

## Handoff OS

`rai handoff` compiles continuity into a single surface so another operator can resume without reconstructing context from scratch.

It emits:

- compact handoff
- PR brief
- session report
- open decisions
- unresolved risks
- verification summary
- decision basis from trust/change-control/explainability
- linked control-plane summaries
- external resume surface links (`repo-status.json`, `export-manifest.json`, `control-plane-packet.json`)
- resume anchor
- `continuity-bundle.json`

## Team Control Room

`rai team-control` makes the multi-agent runtime more operational.

It surfaces:

- role ownership
- active and blocked lanes
- merge queue state
- conflict blockers
- handoff queue
- mailbox / timeline activity
- ownership gaps
- escalations and next commands

## Measurement / ROI

`rai measure` makes value visible instead of implied.

Metrics include:

- findings found / closed
- automated corrections
- verification pass rate
- merge-ready ratio
- closure estimate
- large-repo coverage
- frontend polish debt trend
- export coverage
- control-plane packet presence
- explainability tier visibility
- handoff open loops
- team mailbox / handoff queue activity

## Explainability

`rai explain` shows:

- why a lane was selected
- why a bundle was chosen
- which signals mattered most
- which surfaces were already surveyed
- which surfaces were not surveyed yet
- confidence breakdown and tier
- what deep mode would add
- which next commands would raise confidence

## Lifecycle Center

`rai lifecycle` groups install, upgrade, doctor, health, repair, rollback hints, repo-config drift, and export drift into one lifecycle surface.

This is the place to answer:

- is installation complete?
- is there upgrade drift?
- is runtime drift present?
- is repo-config drift present?
- is export drift present?
- which self-healing steps are safe?
- what is the rollback hint?
