# raiola skill

`raiola` is the Codex-facing skill surface for the workflow product.

The primary CLI shell is `rai`. The published package is `raiola`. Repo-local npm fallbacks use the `raiola:*` namespace, and `raiola-on` is the blank-state onboarding entry.

It stays opt-in. If the user did not explicitly ask for workflow, milestone, handoff, closeout, quick mode, or team orchestration, normal task execution should continue without activating this skill.

## Quick command layer

- `$raiola-help`
  Show the daily-use command surface and when to use quick/full/team.
- `$raiola-on`
  Open the blank-state onboarding entry and propose a milestone to start.
- `$raiola-next`
  Ask for the single safest next move.
- `$raiola-quick`
  Start or continue quick mode for a narrow task.
- `$raiola-checkpoint`
  Write a continuity checkpoint before compacting or handing off.
- `$raiola-team`
  Open Team Lite orchestration when the user explicitly asks for delegation/parallelism.
- `$raiola-review`
  Generate a review-ready package.
- `$raiola-ship`
  Generate a ship-ready package.

## CLI mapping

- `$raiola-help` -> `rai help`
- `$raiola-on` -> `rai on next` or `raiola-on next`
- `$raiola-next` -> `rai next`
- `$raiola-quick` -> `rai quick`
- `$raiola-checkpoint` -> `rai checkpoint`
- `$raiola-team` -> `rai team`
- `$raiola-review` -> `rai review`
- `$raiola-ship` -> `rai ship`

## Full contract

For the detailed workflow contract, lifecycle rules, wave rules, packet behavior, and closeout expectations, read [`SKILL.md`](./SKILL.md).

For repo-level install, docs, and CLI usage, read the root [`README.md`](../README.md).
```

Run health checks:

```bash
npm run raiola:doctor -- --strict
npm run raiola:health -- --strict
npm run raiola:plan-check -- --strict
npm run raiola:automation -- --mode phase
```

Close a milestone:

```bash
npm run raiola:complete-milestone -- --agents-review unchanged --summary "Auth drift resolved" --stage-paths src/foo,tests/foo
```

## Core files

- `WORKSTREAMS.md`
  Tracks the active root and named workstreams.
- `STATUS.md`
  Stores active-window status only.
- `CONTEXT.md`
  Stores the active milestone's working context.
- `EXECPLAN.md`
  Holds the canonical `Plan of Record`.
- `VALIDATION.md`
  Holds the audit contract.
- `HANDOFF.md`
  Stores pause/resume state.
- `WINDOW.md`
  Tracks context budget and chunking decisions.
- `CARRYFORWARD.md`
  Stores unfinished active work that must survive closeout.
- `SEEDS.md`
  Stores future ideas that are not active work yet.
- `MEMORY.md`
  Stores active recall and durable notes.

## Most-used commands

```bash
rai milestone --id Mx --name "..." --goal "..." --profile standard --automation manual
npm run raiola:automation -- --mode phase
npm run raiola:next
npm run raiola:hud
npm run raiola:map-codebase
npm run raiola:map-frontend
npm run raiola:delegation-plan
npm run raiola:plan-check -- --sync --strict
npm run raiola:packet -- --step plan --json
npm run raiola:pause-work -- --summary "..."
npm run raiola:resume-work
npm run raiola:save-memory -- --title "..." --note "..."
npm run raiola:plant-seed -- --title "..." --trigger "..."
npm run raiola:switch-workstream -- --name "<slug>" --create
npm run raiola:workstreams status
npm run raiola:doctor -- --strict
npm run raiola:health -- --strict
npm run raiola:evidence-check -- --strict
npm run raiola:forensics
```

## Named workstreams

The default root is `docs/workflow`.

If one repository needs an isolated workflow surface for a specific stream, create a named workstream:

```bash
npm run raiola:switch-workstream -- --name yahoo-sync --create
```

This creates a parallel surface such as `docs/yahoo-sync/` and makes it the active root.

## Team Lite delegation

Use delegation planning when the task is explicitly parallelized and ownership is clear.

- `raiola:map-codebase` builds stack, architecture, quality, and risk lanes with freshness metadata.
- `raiola:map-codebase` also writes `STACK.md`, `INTEGRATIONS.md`, `ARCHITECTURE.md`, `STRUCTURE.md`, `TESTING.md`, and `CONCERNS.md` under `.workflow/codebase/`.
- `raiola:delegation-plan -- --activation-text "<user request>"` can activate Team Lite from explicit user phrasing such as `parallel yap`, `subagent kullan`, `delegate et`, or `team mode`.
- `raiola:delegation-plan -- --start` turns the plan into a real orchestration runtime with packets, results, and wave state.
- `execute` fan-out is only safe when worker write scopes are explicit and disjoint.

## Frontend specialization

Use frontend specialization when workflow is active and frontend/UI signals appear.

- `raiola:map-frontend` fingerprints framework, styling, UI system, forms/data/motion/test stack, and Storybook/Figma/Playwright surfaces.
- It writes `FRONTEND_PROFILE.md` in the active workflow root and `.workflow/frontend-profile.json` in the repo runtime surface.
- Frontend auto mode should turn on when the active milestone points at UI work such as React/TSX-heavy component scope, `components.json`, Tailwind, Storybook, Figma links, preview/browser validation, or user intent like `frontend`, `UI`, `screen`, `component`, `design`, or `responsive`.
- Once frontend mode is active, route through the adapter registry:
  - `shadcn`
  - `react-best-practices`
  - `web-design-guidelines`
  - `figma-implement-design`
  - `browser-verify`
- Frontend milestones should expand `VALIDATION.md` with the visual verdict protocol:
  - `responsive`
  - `interaction`
  - `visual consistency`
  - `component reuse`
  - `accessibility smoke`
  - `screenshot evidence`

## Minimum done by step

- `discuss`
  Intent capture, constraint extraction, and execution shaping are complete.
  User intent, explicit constraints, success rubric, and requirement list are filled in.
  Scope is framed with evidence.
- `research`
  Touched files, dependencies, and risks are known.
  Verification surface is identified.
  `VALIDATION.md` is narrowed to milestone scope.
- `plan`
  Strategy, rollback/fallback, blockers, frontend routing when relevant, waves, and chunks are written down.
  Coverage has no orphan or duplicate requirements.
  `raiola:plan-check -- --sync --strict` reaches `pass` before execute.
- `execute`
  Only ready chunks from the active wave are implemented.
  Status fields are updated.
  Off-plan drift is written back into docs if needed.
- `audit`
  Verify commands have been run.
  Manual checks and residual risks are documented.
  Frontend milestones close the visual verdict protocol, not just the functional contract.
  `raiola:health -- --strict` is clean when required.
- `complete`
  Archive output is written.
  Carryforward is decided.
  Git closeout scope is made explicit.

## Memory model

- `Active Recall Items`
  Temporary notes that should be automatically revisited while the current milestone is still active.
- `Durable Notes`
  Longer-lived notes that should survive milestone closeout.

Save an active memory item:

```bash
npm run raiola:save-memory -- --title "UI preference" --note "Keep responses short"
```

Save a durable note:

```bash
npm run raiola:save-memory -- --mode durable --title "Repo rule" --note "..."
```

## Visibility rule

The Codex app cannot reliably apply custom coloring per skill, so workflow updates should be made visually distinct in plain text.

When workflow is active, commentary updates should use the `WORKFLOW:` prefix and ideally include the active step, milestone, and root.

Examples:

- `WORKFLOW: discuss | milestone=M2 | root=docs/workflow`
- `WORKFLOW: research | milestone=M2 | root=docs/workflow`
- `WORKFLOW: execute | milestone=M2 | root=docs/workflow`
- `WORKFLOW: audit | milestone=M2 | root=docs/workflow`
- `WORKFLOW: handoff | milestone=M2 | root=docs/workflow`

Example update:

```text
WORKFLOW: discuss | milestone=M2 | root=docs/workflow
I am reading the active root and current state first; next I will write evidence-backed assumptions into CONTEXT.md.
```

```text
WORKFLOW: execute | milestone=M2 | root=docs/workflow
I am applying the planned edits now; after that I will re-run doctor and health checks on the workflow surface.
```

```text
WORKFLOW: handoff | milestone=M2 | root=docs/workflow
I am not starting a new step in this window; I am leaving the resume command and cursor in HANDOFF.md.
```

## Failure playbook

- `Hash drift`
  `raiola:packet -- --all --sync -> raiola:window -- --sync -> raiola:health -- --strict`
- `Active root mismatch`
  `raiola:workstreams status -> raiola:switch-workstream` or use `--root` to return to the correct root

## Generated state

`raiola:hud` also refreshes `.workflow/state.json`.

- Treat it as a convenience summary for compact UX surfaces.
- Do not treat it as canonical state; the markdown workflow files remain authoritative.
- `raiola:doctor` and `raiola:next` also refresh it so the runtime summary stays current between HUD calls.
- The same rule applies to `.workflow/codebase-map.json` and `.workflow/delegation-plan.json`.
- The same rule also applies to `.workflow/frontend-profile.json`.
- The same rule also applies to `.workflow/codebase/*` and `.workflow/orchestration/*`.
- `Resume ambiguity`
  Read `HANDOFF.md` and `WINDOW.md`, then run `raiola:resume-work -> raiola:next`
- `Dirty worktree closeout`
  Use explicit `--stage-paths`, or `--allow-workflow-only` when it is truly docs-only

## Retro surface

- `RETRO.md` is for workflow quality, not product validation.
- Update it after every `5` completed milestones, after repeated process failures, or when explicitly requested.
- In `full` profile, it is good practice to check whether a retro update is needed during audit or complete.

## Common mistakes

- Activating workflow for a normal task that does not need it
- Using `STATUS.md` as a historical changelog
- Creating a second source of truth instead of using `EXECPLAN.md`
- Closing a milestone before filling out `VALIDATION.md`
- Treating `CARRYFORWARD.md` and `SEEDS.md` as the same thing
- Creating a named workstream but still operating against the old root

## Short checklist

- Is the active root correct?
- Are the active milestone and active step explicit?
- Is `CONTEXT.md` up to date after research?
- Is `EXECPLAN.md` written as dependency-aware execution waves?
- Is `VALIDATION.md` narrowed to milestone scope?
- If frontend mode is active, did `raiola:map-frontend` run and did `VALIDATION.md` expand the visual verdict rows?
- Is `raiola:health -- --strict` clean when it needs to be?
