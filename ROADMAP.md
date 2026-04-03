# ROADMAP

`codex-workflow-kit` is evolving from a markdown-first starter kit into a repo-native workflow platform for Codex that remains explicit, auditable, and lightweight while becoming much stronger at orchestration, planning quality, and frontend/UI work.

This roadmap is the current product plan for that evolution.

## Vision

Build a workflow layer that is:

- installable
- orchestration-aware
- Codex app optimized
- planning-strong
- coverage-disciplined
- frontend-sensitive
- visual-audit capable
- still explicit opt-in and markdown-canonical

## Product Principles

- Repository markdown remains the canonical source of truth.
- Generated runtime state may exist, but it must never replace the workflow documents.
- Workflow stays explicit opt-in.
- Subagent delegation is not the default path; it activates only in explicit parallel/team/delegate mode.
- Automatically detected lanes and modes must always be overridable by user intent or repository preferences.
- The orchestrator stays thin and should not do the heavy lifting itself.
- Plan quality, audit quality, resume quality, and coverage quality matter as much as code changes.
- Frontend specialization should become context-aware, not purely command-driven.
- Every major new workflow surface should ship with fixture-based verification, not just documentation.

## Strategic Inputs

We are intentionally combining two different disciplines.

### From GSD

- coverage-first planning
- brownfield codebase mapping
- thin orchestrator discipline
- wave-based execution
- plan verification before execution
- observable success criteria
- anti-horizontal slicing rules

### From OMX

- intent-first routing
- clear role catalog for agent work
- compact runtime surfaces
- worktree-aware orchestration
- visual verdict discipline
- strong setup and doctor ergonomics

## What We Will Not Copy

- GSD's full `.planning/` universe
- OMX's heavy tmux-first runtime product
- a second canonical state system
- mandatory workflow activation for every task

## Target Architecture

### Canonical Control Plane

- `CONTEXT.md`
- `EXECPLAN.md`
- `VALIDATION.md`
- `HANDOFF.md`
- `WINDOW.md`
- `WORKSTREAMS.md`
- optional `VERIFICATION_BRIEF.md` or `TEST_SPEC.md`

### Runtime Surfaces

- `workflow:init`
- `workflow:hud`
- `workflow:delegation-plan`
- `workflow:map-codebase`
- `workflow:plan-check`
- `workflow:map-frontend`

### Generated State

- `.workflow/state.json`
- optional `.workflow/frontend-profile.json`

### Skill Intelligence

- intent routing
- lane routing
- frontend routing
- Team Lite delegation policy

### Codex App UX

- compact outputs
- handoff packets
- review-mode summaries
- worktree-safe delegation rules

### Compatibility and Migration

- `workflow:migrate`
- version-aware template or schema markers
- migration notes for already-installed repositories

### Quality Harness

- fixture repositories
- golden output tests for CLI surfaces
- end-to-end workflow scenario tests

## Cross-Cutting Disciplines

These are not isolated features. They must shape the whole system.

### Coverage Discipline

Every meaningful plan should support:

- requirement list capture
- requirement to milestone mapping
- requirement to plan-chunk mapping
- requirement to validation mapping
- orphan and duplicate detection

This will be enforced by `workflow:plan-check`.

### Wave and Orchestrator Discipline

Parallel execution should be dependency-aware:

- wave 1, wave 2, wave 3 execution grouping
- only dependency-free work can run in the same wave
- orchestrator delegates, waits, integrates, and routes next steps
- workers own bounded tasks with explicit write scope

### Frontend Auto Mode

When workflow is active and the task context clearly shifts into frontend/UI work, the skill should automatically switch into a frontend-specialized lane.

Signals for automatic activation:

- React or TSX-heavy edit scope
- `components.json`
- Tailwind config or Tailwind-heavy component work
- Storybook presence
- Figma links or design implementation requests
- dev server and preview verification needs
- user intent such as `landing page`, `frontend`, `UI`, `screen`, `component`, `design`, `responsive`

Behavior once frontend mode is active:

- fingerprint the frontend stack
- route to the right adapter path
- expand visual audit expectations
- prefer design-system-aware implementation
- enforce visual verdict checks during audit when relevant

Important constraint:

- Frontend auto mode should auto-specialize the lane, not auto-activate workflow itself.

### Override and Safety Discipline

Adaptive behavior needs a clear override path and safe defaults.

- Frontend auto mode should support repository and runtime settings such as `auto`, `on`, and `off`.
- Team Lite should support repository and runtime settings such as `explicit_only`, `suggest`, and `off`.
- Planner and checker roles should be read-only by default.
- Worker roles must not share overlapping write ownership inside the same wave.
- Orchestrators should surface the delegation plan before spawning write-capable workers when the mode requires confirmation.

### Freshness and Refresh Discipline

Generated maps and snapshots should include freshness rules.

- `workflow:map-codebase` outputs should record:
  - scope
  - generated timestamp
  - input fingerprint or hash
  - refresh status
- `workflow:map-frontend` outputs should record:
  - active workstream scope
  - frontend fingerprint inputs
  - generated timestamp
  - refresh status
- The system should prefer incremental refresh over full regeneration where possible.
- Codebase and frontend maps should support per-workstream scope, not just repository-global scope.

## Role Catalog

The role catalog for Team Lite should stay small and explicit:

- `main`
- `explorer`
- `planner`
- `checker`
- `worker`
- `verifier`
- `debugger`

## Final Priority Order

1. `workflow:init`
2. `workflow:hud` + `.workflow/state.json`
3. `workflow:map-codebase`
4. `workflow:delegation-plan` + Team Lite
5. `workflow:plan-check` + coverage matrix
6. improved discuss/planning
7. wave-based execution policy
8. `workflow:map-frontend` + frontend auto mode + visual verdict
9. compact Codex app surfaces + optional automations

## Phase 1 - Foundation and Installability

### Goal

Make the kit installable, visible, and immediately usable in a target repo.

### Delivery Meta

- Status: `implemented`
- Owner: `core workflow platform`
- Dependencies:
  - `None`
- Risks:
  - `Install automation may become too package-manager-specific`
  - `Migration support may lag behind template evolution if schema markers are weak`

### Deliverables

- `workflow:init`
- `workflow:hud`
- `workflow:hud --compact`
- `workflow:migrate`
- `.workflow/state.json`

### Scope

- Install `docs/workflow`, `scripts/workflow`, and the skill into a target repository.
- Offer optional `package.json` script patching guidance or automation.
- Offer optional `AGENTS.md` patch templates.
- Add a migration path for repositories already using an earlier version of the starter kit.
- Show active root, milestone, step, readiness, packet hashes, drift, health summary, next action, handoff state, and carryforward/seed counts in one place.
- Keep `state.json` generated and non-canonical.

### Files

- `README.md`
- `skill/SKILL.md`
- `templates/workflow/RUNTIME.md`
- `scripts/workflow/init.js`
- `scripts/workflow/migrate.js`
- `scripts/workflow/hud.js`

### Acceptance Criteria

- A new repository can install the workflow surface with one command.
- An existing repository can upgrade without manually rebuilding the workflow surface.
- `workflow:doctor`, `workflow:health`, `workflow:next`, and `workflow:hud` all work after setup.

## Phase 2 - Mapping, Orchestration Core, and Team Lite

### Goal

Bring in a thin orchestrator model that keeps main context lean while enabling safe parallel work.

### Delivery Meta

- Status: `done`
- Owner: `orchestration and runtime lane`
- Dependencies:
  - `Phase 1`
- Risks:
  - `Delegation rules may become too vague without explicit ownership contracts`
  - `Parallel execution can increase confusion if compact surfaces are not ready early`
  - `Worktree-safe guidance may differ across repositories and user habits`

### Deliverables

- `workflow:map-codebase`
- `workflow:delegation-plan`
- Team Lite delegation policy
- intent-to-delegation routing

### Scope

- `workflow:map-codebase` should support four parallel research lanes:
  - stack
  - architecture
  - quality/testing
  - risks/concerns
- Generated outputs can be markdown docs, JSON, or both.
- Mapping outputs should include freshness metadata and support incremental refresh.
- `workflow:delegation-plan` should assign work across:
  - main
  - explorer
  - planner
  - checker
  - worker
  - verifier
  - debugger
- Team Lite must activate only in explicit parallel mode.
- Delegation policy:
  - `discuss` and most `plan` work stays with the main agent
  - `research` can fan out to explorers
  - `execute` can fan out only when write scope is disjoint
  - `audit` can use verifier and debugger roles
- Worker ownership must be explicit before parallel write-capable execution starts.

### Files

- `skill/SKILL.md`
- `templates/workflow/RUNTIME.md`
- `scripts/workflow/next_step.js`
- `scripts/workflow/delegation_plan.js`
- `scripts/workflow/map_codebase.js`

### Acceptance Criteria

- Large tasks can be explored, planned, or audited in parallel without bloating the main agent context.
- Delegation decisions are predictable and repeatable.

## Phase 3 - Coverage-Driven Interview, Discuss, and Planning

### Goal

Improve planning quality so the system better understands what should be built before execution begins.

### Delivery Meta

- Status: `planned`
- Owner: `planning and validation lane`
- Dependencies:
  - `Phase 1`
  - `Phase 2`
- Risks:
  - `The planning surface may become too heavy if new sections are not kept disciplined`
  - `Coverage rules can create ritual overhead if they are too strict for small tasks`
  - `Users may resist additional planning if the value is not immediately visible in execution quality`

### Deliverables

- improved `discuss`
- `workflow:plan-check`
- coverage matrix support
- optional `VERIFICATION_BRIEF.md` or `TEST_SPEC.md`

### Scope

- Break `discuss` into:
  - `intent capture`
  - `constraint extraction`
  - `execution shaping`
- Add to `CONTEXT.md`:
  - user intent
  - explicit constraints
  - alternatives considered
  - unanswered high-leverage questions
  - success rubric
  - requirement list
- Add to `EXECPLAN.md`:
  - chosen strategy
  - rejected strategies
  - rollback/fallback
  - dependency blockers
  - wave structure
- Add to `VALIDATION.md`:
  - acceptance criteria
  - user-visible outcomes
  - regression focus
- Enforce requirement mapping and plan quality through `workflow:plan-check`.
- Prefer vertical capability slices over horizontal technical slicing.
- Fail `workflow:plan-check` when coverage is incomplete or when horizontal slicing dominates an otherwise user-visible milestone.

### Files

- `templates/workflow/CONTEXT.md`
- `templates/workflow/EXECPLAN.md`
- `templates/workflow/VALIDATION.md`
- `scripts/workflow/new_milestone.js`
- `scripts/workflow/plan_check.js`

### Acceptance Criteria

- `plan-ready` becomes `yes` only after quality gates pass.
- The answer to "what are we building and how will we validate it?" is explicit before audit begins.

## Phase 4 - Wave-Based Execution

### Goal

Make `execute` stronger through controlled parallelism.

### Delivery Meta

- Status: `implemented`
- Owner: `execution systems lane`
- Dependencies:
  - `Phase 2`
  - `Phase 3`
- Risks:
  - `Wave execution may add too much ceremony for small milestones`
  - `Commit granularity settings can create inconsistent closeout behavior if defaults are unclear`
  - `Execution waves are only useful if plan artifacts capture dependency boundaries well`

### Deliverables

- wave-based execution policy
- optional atomic commit mode
- worker orchestration rules

### Scope

- Run `execute` through explicit `wave 1 -> wave 2 -> wave 3` progression.
- Only dependency-free work should run in the same wave.
- Parallel workers must be opened from dependency-aware plan entries, not ad hoc or capacity-first.
- Each wave should record ownership, dependency assumptions, write scope, and merge or integration order.
- `PREFERENCES.md` may optionally define `commit_granularity` with:
  - `phase`
  - `chunk`
  - `manual`
- `EXECPLAN.md` may optionally enable atomic commit mode for the active milestone:
  - `wave`
  - `chunk`
- Keep atomic mode optional; do not force chunk or wave commits everywhere.

### Files

- `templates/workflow/PREFERENCES.md`
- `templates/workflow/EXECPLAN.md`
- `skill/SKILL.md`

### Acceptance Criteria

- Parallel execution becomes safer instead of looser.
- Write conflicts go down because same-wave ownership is explicit.
- Execution plans become easier to inspect, integrate, and resume.

## Phase 5 - Frontend and UI Specialization

### Goal

Make the workflow platform understand frontend work deeply enough to route, implement, and audit it intelligently.

### Delivery Meta

- Status: `implemented`
- Owner: `frontend specialization lane`
- Dependencies:
  - `Phase 1`
  - `Phase 3`
- Risks:
  - `Frontend auto mode may over-trigger in mixed repositories without good fingerprinting`
  - `Adapter routing can become brittle if too many ecosystems are added too early`
  - `Visual verdict quality depends on having reliable browser and screenshot verification paths`

### Deliverables

- `workflow:map-frontend`
- frontend auto mode
- visual verdict alt-protocol
- adapter registry

### Scope

- `workflow:map-frontend` should fingerprint:
  - framework
  - styling stack
  - UI system
  - forms/data/motion/test stack
  - Storybook/Figma/Playwright presence
- Generated outputs:
  - `FRONTEND_PROFILE.md`
  - or `.workflow/frontend-profile.json`
- Frontend auto mode should activate automatically when workflow is active and frontend/UI signals are present.
- Automatic activation signals include:
  - `React/TSX-heavy edit surface`
  - `components.json`
  - `Tailwind config`
  - `Storybook`
  - `Figma link`
  - `dev server / preview validation need`
  - `user intent such as landing page, frontend, UI, screen, component, design, responsive`
- Frontend auto mode should be overrideable via repository preference and one-shot runtime override.
- The skill should then route through the right adapter path.
- Adapter registry should support:
  - shadcn
  - React best practices
  - web-design-guidelines
  - Figma implementation
  - browser verify
- Visual verdict should cover:
  - responsive behavior
  - interaction checks
  - visual consistency
  - component reuse
  - accessibility smoke checks
  - screenshot evidence
- Frontend mapping should support per-workstream scope and refresh status so mixed frontend and backend repositories do not over-trigger the lane.

### Files

- `scripts/workflow/map_frontend.js`
- `templates/workflow/VALIDATION.md`
- `skill/SKILL.md`

### Acceptance Criteria

- Frontend work is automatically recognized and specialized.
- UI work closes against visual and UX quality, not just functional checks.

## Phase 6 - Codex App Experience

### Goal

Make the workflow layer feel native and efficient inside the Codex app.

### Delivery Meta

- Status: `planned`
- Owner: `app experience and workflow UX lane`
- Dependencies:
  - `Phase 1`
  - `Phase 2`
  - `Phase 5`
- Risks:
  - `Compact surfaces may hide too much information if field design is not stable`
  - `App-specific optimizations can leak too much into the generic starter kit if not scoped carefully`
  - `Automation ideas can outpace actual workflow stability if added too early`

### Deliverables

- `workflow:handoff --compact`
- `workflow:delegation-plan --compact`
- compact update contract
- review-mode output
- thread kickoff templates
- worktree-aware guidance
- optional automations
- `workflow:workstreams {list|create|switch|status|progress|resume|complete}`
- enforced `solo|team` runtime presets
- real `workflow:ensure-isolation` setup for `none|branch|worktree`
- packet-level `Reasoning profile: fast|balanced|deep|critical`
- plan/audit counterexample pass via `What Would Falsify This Plan?`

### Scope

- Compact outputs should fit naturally into app threads.
- Handoff packets should be easy to paste into resume threads.
- Review-mode output should summarize:
  - what changed
  - what remains
  - what to verify
- Codex app rule:
  - if explicit parallel mode is active, subagent spawning is allowed
  - otherwise the main agent continues locally
- Optional automations:
  - daily health snapshot
  - stale packet warning
  - open carryforward summary
- Compact surfaces should prefer stable field ordering so repeated app sessions stay easy to scan.

### Files

- `skill/SKILL.md`
- `templates/workflow/HANDOFF.md`
- `templates/workflow/RUNTIME.md`

### Acceptance Criteria

- Thread-based workflow remains readable and efficient without constant document hopping.
- Multiple named streams can be scanned in one command to see stale vs budget-out status.

## Subagent Final Design

- Subagent mode is not the default.
- It activates only with explicit user intent or explicit parallel mode.
- `research` uses `3-4` explorer lanes when justified.
- `plan` can use `planner + checker + validation planner`.
- `execute` can use worker waves only with disjoint write scope.
- `audit` can use `verifier` and, if needed, `debugger`.
- The orchestrator:
  - decomposes work
  - waits selectively
  - integrates results
  - decides the next route
- Workers:
  - own bounded responsibilities
  - avoid overlapping writes
  - report back with verification-ready output

## Success Criteria for the Roadmap

When this roadmap is complete, `codex-workflow-kit` should be:

- installable in one pass
- strong at research and planning
- explicit and auditable
- capable of safe parallel orchestration
- naturally usable inside Codex app
- able to detect frontend work and switch into a frontend-specialized lane automatically
- strong at visual and UX validation without abandoning markdown-native workflow control

## Validation Strategy for the Roadmap

Every major roadmap item should ship with verification, not just implementation.

### Fixture Repositories

Maintain fixture repositories or fixture directories for:

- backend-only repositories
- frontend-heavy repositories
- mixed full-stack repositories
- multi-workstream repositories

### Golden and CLI Verification

Add golden or contract tests for:

- `workflow:init`
- `workflow:migrate`
- `workflow:hud`
- `workflow:delegation-plan`
- `workflow:plan-check`
- `workflow:map-codebase`
- `workflow:map-frontend`

### Workflow Scenario Tests

Maintain end-to-end scenarios for:

- fresh install to first milestone
- brownfield mapping to plan-ready state
- Team Lite research fan-out
- frontend auto mode activation and override
- closeout plus migration on an upgraded repository
