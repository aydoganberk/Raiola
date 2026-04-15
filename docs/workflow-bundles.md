# Workflow Bundles

`rai start` is the productized entry over the deeper Raiola command surface.

Instead of expecting operators to remember which commands overlap, the bundle layer groups complementary features under one structured start plan. The repo shape is identified first, the right bundle is selected, the start profile widens or narrows the lane, optional add-ons package supporting commands together, and the resulting plan is written to runtime artifacts that help, dashboard, and `rai do` can reuse.

## Why this layer exists

Large workflow kits often accumulate powerful commands faster than they accumulate a coherent entry experience. The bundle layer exists to solve six product problems:

- overlapping commands that target the same operator intent
- slow starts where users have to manually discover the right stack
- weak productization for code review, code audit, repo review, and code correction
- weak handoff from findings into bounded correction waves
- poor handoff between help, routing, dashboard, and implementation surfaces
- missing depth control when one operator wants a fast lane and another wants a fuller evidence or handoff lane

## Guided selection

Use these entry points when you want the harness to help choose the lane instead of guessing manually:

```bash
rai start recommend --goal "fix the highest-risk review findings and verify the patch wave"
rai start list
rai help bundles
```

`rai start recommend` returns:

- the selected bundle
- the recommended start profile
- recommended add-ons
- a richer starter command such as `rai start correction --goal "..." --profile deep --with repair|regression`
- alternate candidate bundles when another lane might also make sense

## Bundles

### `slice-delivery`

Default implementation bundle for normal repos.

- best for: everyday delivery slices
- shorthand: `rai start slice --goal "..."`
- grouped focus: route, inspect, plan, fix, verify

### `review-wave`

Blocker-first scoped code-review bundle.

- best for: diff review, risk triage, blocker-first re-review, first correction wave
- shorthand: `rai start review --goal "..."`
- grouped focus: audit, review-mode, review-tasks, fix, re-review, verify, findings registry

### `repo-audit-wave`

Repo-wide audit bundle for non-monorepos.

- best for: broad codebase scans, code audit, hotspot ranking, first repo-wide correction wave
- shorthand: `rai start repo --goal "..."`
- grouped focus: audit, map-codebase, review-orchestrate, review-tasks, fix, verify, ranked packages

### `monorepo-audit-wave`

Large-repo bundle.

- best for: package-aware audits, subsystem ranking, staged correction waves, shard-aware verification
- shorthand: `rai start monorepo --goal "..."`
- grouped focus: monorepo-mode, monorepo intelligence, review orchestration, review tasks, bounded fixes, verification, shard planning

### `correction-wave`

Unified review-correction control-plane bundle.

- best for: turning review or audit findings into surgical patches, bounded refactors, verification, and re-review closure
- shorthand: `rai start correction --goal "..."`
- grouped focus: findings registry triage, correction board, review-tasks, fix, patch-review, verify, re-review, ship-readiness

### `frontend-delivery`

Frontend product bundle.

- best for: shipping or reshaping a UI surface
- shorthand: `rai start frontend --goal "..."`
- grouped focus: map-frontend, ui-direction, ui-spec, state-atlas, component-strategy, ui-plan, ui-recipe, ui-review

### `frontend-review`

Frontend quality bundle.

- best for: accessibility, responsive, design debt, state, and browser-backed review waves
- shorthand: `rai start frontend-review --goal "..."`
- grouped focus: map-frontend, ui-review, responsive-matrix, design-debt, verify, ship-readiness

### `frontend-refactor`

Frontend surface-architecture bundle.

- best for: shared component extraction, page cleanup, route consolidation, UI architecture reshaping
- shorthand: `rai start frontend-refactor --goal "..."`
- grouped focus: map-frontend, component-map, page-blueprint, component-strategy, state-atlas, ui-plan, ui-review

### `frontend-polish`

Frontend consistency bundle.

- best for: design-system alignment, spacing and typography cleanup, loading/empty/error/success state polish, responsive fit-and-finish
- shorthand: `rai start frontend-polish --goal "..."`
- grouped focus: map-frontend, ui-review, design-debt, design-dna, component-map, state-atlas, responsive-matrix, preview

### `frontend-ship-readiness`

Frontend browser-first closeout bundle.

- best for: UI release gates, smoke/browser proof, last-mile state coverage, demo or launch signoff
- shorthand: `rai start frontend-ship --goal "..."`
- grouped focus: map-frontend, ui-review, preview, responsive-matrix, state-atlas, verify, ship-readiness

### `ship-closeout`

Release closeout bundle.

- best for: readiness checks, release packaging, final trust gates
- shorthand: `rai start ship --goal "..."`
- grouped focus: verify, verify-work, ship-readiness, review, ship, release notes

## Start profiles

Profiles control how much depth the bundle opens before the operator starts executing.

### `speed`

Leanest proving spine. Best when the goal is narrow, route confidence is high, and the operator wants the minimum safe lane.

### `balanced`

Default product lane. Keeps route, shaping, and proof connected without widening into every supporting surface.

### `deep`

Wider product lane. Adds complementary commands so planning, evidence, repo intelligence, frontend context, and closeout stay connected for harder tasks.

Use them explicitly when you already know the right depth:

```bash
rai start slice --goal "land the next safe slice" --profile speed
rai start correction --goal "fix the highest-risk review findings and verify the patch wave" --profile deep
```

## Start add-ons

Add-ons widen a bundle with overlapping supporting surfaces without forcing the operator to leave the bundle entry.

### `trust`

Adds secure scanning, evidence graphing, and validation visibility.

### `docs`

Adds packet compilation and discussion-ready documentation outputs.

### `handoff`

Adds PR brief, release notes, session report, and checkpoint surfaces.

### `parallel`

Adds review orchestration, team status, and delegation planning for larger scopes.

### `browser`

Adds preview, responsive matrix, and browser-verification helpers for visual work.

### `surface`

Adds page blueprinting, frontend briefing, and component inventory overlays when a UI surface is broad enough that route families and shared components matter.

### `design-system`

Adds design DNA, component-map, and design-debt overlays so tokens, primitives, spacing, and consistency fixes move together.

### `state`

Adds state-atlas, responsive checks, and review overlays so empty/loading/error/success flows stay attached to the same frontend lane.

### `ownership`

Adds package ownership, hotspot responsibility, and ranked area context to repo-scale review and correction lanes.

### `regression`

Adds test impact, validation mapping, and a visible verify matrix so review findings and correction waves stay connected through proof.

### `shard`

Adds ranked shard selection, next-subsystem sequencing, and wave planning for large repos.

### `repair`

Adds patchability, fix-confidence, and bounded write planning to review and correction work.

### `recommended`

Special token that expands to the current plan's recommended add-ons.

Examples:

```bash
rai start correction --goal "fix the highest-risk review findings and verify the patch wave" --with recommended
rai start review --goal "review the current diff" --with trust|repair|regression
rai start repo --goal "audit the whole repo" --with ownership|repair|docs
rai start monorepo --goal "review and patch the top-risk monorepo subsystem" --profile deep --with shard|ownership|parallel
rai start frontend --goal "ship the premium dashboard surface" --profile deep --with trust|browser|docs
```

## Review-correction control plane

The review, repo-audit, monorepo, and fix lanes now share one normalized findings registry instead of passing ad hoc findings between unrelated commands.

That shared control plane is designed around four user-visible product lanes:

- diff or scoped code review
- repo-wide code audit and ranking
- large-repo shard-aware review
- bounded code correction with verification and re-review closure

The registry keeps one normalized record for each finding with severity, confidence, scope, fixability, verification recipes, and lifecycle status. The correction planner then turns those findings into visible correction waves rather than one blob of follow-up work.

The dashboard mirrors that model through three panels:

- **Review Control Room** for blockers, hotspots, verify queue, and re-review pressure
- **Correction Board** for ready-to-patch items, risky refactors, human-decision items, and verify backlog
- **Large Repo Board** for ranked packages, current shard, next shard, and correction-wave progress
- **Verify Status Board** for shell/browser gate state, queued verification, failed verification, and re-review pressure
- **Ship Readiness Board** for ship blockers, pending approvals, pending verification, and release-wave shape

## Frontend-first intelligence

The frontend bundles no longer depend only on explicit bundle selection. `rai start` now treats strong frontend product language such as dashboard, surface, UI, page, design, mobile, or layout work as a signal to:

- build the frontend profile earlier
- choose a better default bundle when generic ship wording overlaps with frontend delivery
- split frontend work into delivery, review, refactor, polish, or browser-first ship-readiness lanes
- recommend browser proof, page inventory, design-system overlays, and UX-state overlays only when the detected surface benefits from them
- widen into deeper design/context commands only when the detected surface actually benefits from it

This means goals like `ship the premium dashboard surface` can still land in the frontend delivery lane, while goals about shared-component cleanup, visual consistency, or release signoff can route into the more precise frontend bundles.

## Artifacts

Every `rai start` run writes:

- `.workflow/runtime/start-plan.json`
- `.workflow/runtime/start-plan.md`

The review-correction control plane also writes shared artifacts when review, repo-audit, monorepo, or correction flows run:

- `.workflow/reports/findings-registry.json`
- `.workflow/reports/correction-control.json`
- `.workflow/reports/correction-control.md`
- `.workflow/reports/release-control.json`
- `.workflow/reports/release-control.md`

These artifacts contain:

- selected bundle and aliases
- starter command and recommended expanded starter command
- repo context and frontend context summary
- start profile and applied or recommended add-ons
- grouped command families
- phased execution plan
- candidate bundles and operator tips
- normalized findings, correction waves, ranked packages, verify queues, and ship blockers when the control plane is active
- optional execution results when `--run` is used

## Related surfaces

- `rai help bundles` lists the bundle catalog, profiles, and add-ons
- `rai help <bundle-id>` shows bundle-specific help plus outcomes and supported add-ons
- `rai do` can expose candidate bundles, recommended depth, and an expanded starter command
- `rai audit` and `rai fix` route review and correction intent into the shared control plane
- `rai dashboard` can surface the active bundle, profile, add-ons, candidate bundles, operator tips, **Review Control Room**, **Correction Board**, **Large Repo Board**, **Verify Status Board**, and **Ship Readiness Board**

## Examples

```bash
rai start --goal "land the next safe slice"
rai start recommend --goal "fix the highest-risk review findings and verify the patch wave"
rai start review --goal "review the current diff" --with trust|repair|regression
rai start repo --goal "audit the repo and rank correction waves" --with ownership|repair
rai start monorepo --goal "review and patch the top-risk monorepo subsystem" --profile deep --with shard|ownership
rai start correction --goal "fix the highest-risk review findings and verify the patch wave" --with repair|regression
rai start frontend --goal "ship the premium dashboard surface" --profile deep --with trust|browser
rai start ship --goal "close the release safely" --with recommended
```
