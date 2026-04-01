# codex-workflow skill

`codex-workflow` is a repo-local Codex skill for running multi-session, milestone-based work with a consistent control plane.

It does not replace the default coding flow. If the user did not explicitly ask for workflow, milestone, handoff, closeout, or named workstream discipline, normal task execution should continue without activating this skill.

For repo-level setup and installation, see the root [`README.md`](../README.md).

## When to use this skill

Use it when:

- the work will span multiple sessions
- you need explicit handoff or resume support
- you want milestone-level planning and closeout
- you need a validation contract before declaring work complete
- you want carryforward or seed tracking
- you need a separate `docs/<workstream>/` root for one stream of work

## When not to use it

Avoid using it when:

- the task is a simple one-shot bug fix or small refactor
- the user did not explicitly ask for workflow discipline
- updating workflow documents would add more overhead than value

## Mental model

This skill assumes one active milestone at a time.

Each milestone moves through the same lifecycle:

1. `discuss`
2. `research`
3. `plan`
4. `execute`
5. `audit`
6. `complete`

These are steps inside one milestone, not separate milestones.

In most cases, one user request maps to one milestone.

## First 60 seconds

When workflow is active, the expected startup sequence is:

1. Read `AGENTS.md`.
2. Read `docs/workflow/WORKSTREAMS.md` to find the active root.
3. In the active root, scan:
   - `PROJECT.md`
   - `RUNTIME.md`
   - `PREFERENCES.md`
   - `EXECPLAN.md`
   - `STATUS.md`
   - `DECISIONS.md`
   - `MILESTONES.md`
   - `CONTEXT.md`
   - `CARRYFORWARD.md`
   - `VALIDATION.md`
   - `HANDOFF.md`
   - `WINDOW.md`
   - `SEEDS.md`
   - `MEMORY.md`
4. Summarize the current state in `8-12` bullets.
5. Stay strictly within the active milestone and active step scope.

## Workflow profiles

- `lite`
  Low-ritual mode for smaller or shorter tasks.
- `standard`
  Default general-purpose workflow mode.
- `full`
  Stronger process mode for real handoff, closeout, and workflow-quality tracking.

## Fast path

Open a milestone:

```bash
npm run workflow:new-milestone -- --id M2 --name "Fix auth drift" --goal "Tighten and verify the auth flow"
```

See the next recommended action:

```bash
npm run workflow:next
```

Run health checks:

```bash
npm run workflow:doctor -- --strict
npm run workflow:health -- --strict
```

Close a milestone:

```bash
npm run workflow:complete-milestone -- --agents-review unchanged --summary "Auth drift resolved" --stage-paths src/foo,tests/foo
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
npm run workflow:new-milestone -- --id Mx --name "..." --goal "..."
npm run workflow:next
npm run workflow:packet -- --step plan --json
npm run workflow:pause-work -- --summary "..."
npm run workflow:resume-work
npm run workflow:save-memory -- --title "..." --note "..."
npm run workflow:plant-seed -- --title "..." --trigger "..."
npm run workflow:switch-workstream -- --name "<slug>" --create
npm run workflow:workstreams status
npm run workflow:doctor -- --strict
npm run workflow:health -- --strict
npm run workflow:evidence-check -- --strict
npm run workflow:forensics
```

## Named workstreams

The default root is `docs/workflow`.

If one repository needs an isolated workflow surface for a specific stream, create a named workstream:

```bash
npm run workflow:switch-workstream -- --name yahoo-sync --create
```

This creates a parallel surface such as `docs/yahoo-sync/` and makes it the active root.

## Minimum done by step

- `discuss`
  Goal, non-goals, and success signal are clear.
  Canonical refs and assumptions are filled in.
  Scope is framed with evidence.
- `research`
  Touched files, dependencies, and risks are known.
  Verification surface is identified.
  `VALIDATION.md` is narrowed to milestone scope.
- `plan`
  `CONTEXT.md` is plan-ready.
  The work is split into `1-2` run-sized chunks.
  Audit and overhead planning are written down.
- `execute`
  Only the active chunk is implemented.
  Status fields are updated.
  Off-plan drift is written back into docs if needed.
- `audit`
  Verify commands have been run.
  Manual checks and residual risks are documented.
  `workflow:health -- --strict` is clean when required.
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
npm run workflow:save-memory -- --title "UI preference" --note "Keep responses short"
```

Save a durable note:

```bash
npm run workflow:save-memory -- --mode durable --title "Repo rule" --note "..."
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
  `workflow:packet -- --all --sync -> workflow:window -- --sync -> workflow:health -- --strict`
- `Active root mismatch`
  `workflow:workstreams status -> workflow:switch-workstream` or use `--root` to return to the correct root
- `Resume ambiguity`
  Read `HANDOFF.md` and `WINDOW.md`, then run `workflow:resume-work -> workflow:next`
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
- Is `EXECPLAN.md` split into `1-2` run-sized chunks?
- Is `VALIDATION.md` narrowed to milestone scope?
- Is `workflow:health -- --strict` clean when it needs to be?
