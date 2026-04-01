# codex-workflow-kit

`codex-workflow-kit` is a reusable starter kit for bringing structured Codex workflow discipline into another repository.

It gives you a ready-made control plane for work that spans multiple sessions, needs explicit handoff and resume support, or benefits from milestone-based planning, validation, and closeout.

## What this kit includes

- `templates/workflow/`
  Starter workflow documents intended to live under `docs/workflow/` in the target repository.
- `scripts/workflow/`
  Helper scripts for milestone creation, packet building, health checks, handoff, validation, and workstream switching.
- `scripts/compare_golden_snapshots.ts`
  A small utility for comparing file or directory snapshots.
- `skill/`
  A repo-local Codex workflow skill you can install into the target repo.

## What problem it solves

This kit is for repositories where "just continue from memory" is not enough.

It helps when you want:

- explicit milestone tracking instead of vague progress notes
- a single source of truth for the current plan
- handoff and resume support across sessions
- a validation contract before calling work done
- carryforward and seed tracking for unfinished or future work
- named workstreams when one repo needs multiple parallel documentation roots

The workflow is intentionally opt-in. If the user does not explicitly want workflow discipline, normal task execution should continue without activating this system.

## How it works

The system centers around a workflow document surface, usually installed at `docs/workflow/`.

At runtime, Codex reads and updates a small set of markdown files plus helper scripts:

- `WORKSTREAMS.md`
  Tracks the active workflow root and named workstreams.
- `STATUS.md`
  Holds the current active-window status only.
- `CONTEXT.md`
  Stores the active milestone's working context and research state.
- `EXECPLAN.md`
  Holds the canonical `Plan of Record`.
- `VALIDATION.md`
  Defines what must be verified before the milestone is considered complete.
- `HANDOFF.md`
  Captures pause/resume state between sessions.
- `WINDOW.md`
  Tracks packet and context-window budget decisions.
- `CARRYFORWARD.md`
  Holds unfinished items that must survive milestone closeout.
- `SEEDS.md`
  Holds future ideas that should not be treated as active work.
- `MEMORY.md`
  Stores active recall and durable memory notes.
- `DECISIONS.md`
  Stores durable, cross-milestone process or architecture decisions.
- `RETRO.md`
  Stores workflow-quality improvements rather than product validation.

## Milestone lifecycle

Each active milestone follows the same loop:

1. `discuss`
2. `research`
3. `plan`
4. `execute`
5. `audit`
6. `complete`

These are steps inside a single milestone, not separate milestones.

In practice:

- `discuss` frames the goal, non-goals, assumptions, and success signal
- `research` identifies touched files, dependencies, risks, and verification surface
- `plan` writes the canonical implementation plan into `EXECPLAN.md`
- `execute` applies only the active chunk of work
- `audit` runs validation checks and records residual risks
- `complete` archives the milestone, cleans up active recall, and prepares closeout

## Install into another repository

Copy the workflow surface, scripts, and skill into the target repo:

```bash
mkdir -p /path/to/target-repo/docs
mkdir -p /path/to/target-repo/scripts
mkdir -p /path/to/target-repo/.agents/skills/codex-workflow

cp -R templates/workflow /path/to/target-repo/docs/workflow
cp -R scripts/workflow /path/to/target-repo/scripts/workflow
cp scripts/compare_golden_snapshots.ts /path/to/target-repo/scripts/compare_golden_snapshots.ts
cp skill/SKILL.md /path/to/target-repo/.agents/skills/codex-workflow/SKILL.md
```

Then merge the `scripts` section from this repo's [`package.json`](./package.json) into the target repo's `package.json`.

Finally, update the target repo's `AGENTS.md` so the workflow rules match that repository's conventions.

## Quick start in a target repo

Once installed, these are the first commands to run:

```bash
npm run workflow:doctor -- --strict
npm run workflow:health -- --strict
npm run workflow:next
```

If the surface is clean, open the first milestone:

```bash
npm run workflow:new-milestone -- --id M1 --name "Initial setup" --goal "Set up the first workflow-backed task"
```

During execution, the most common loop is:

```bash
npm run workflow:next
npm run workflow:packet -- --step plan --json
npm run workflow:health -- --strict
```

To close a milestone:

```bash
npm run workflow:complete-milestone -- --agents-review unchanged --summary "Milestone completed" --stage-paths src/foo,tests/foo
```

## Core commands

```bash
npm run workflow:new-milestone -- --id Mx --name "..." --goal "..."
npm run workflow:complete-milestone -- --agents-review unchanged --summary "..."
npm run workflow:next
npm run workflow:packet -- --step plan --json
npm run workflow:pause-work -- --summary "..."
npm run workflow:resume-work
npm run workflow:doctor -- --strict
npm run workflow:health -- --strict
npm run workflow:evidence-check -- --strict
npm run workflow:forensics
npm run workflow:save-memory -- --title "..." --note "..."
npm run workflow:plant-seed -- --title "..." --trigger "..."
npm run workflow:workstreams status
npm run workflow:switch-workstream -- --name "<slug>" --create
npm run workflow:compare-golden -- --help
```

If your repo does not use `npm`, run the same underlying `node` commands directly or mirror these script names in your preferred package manager.

## Named workstreams

The default root is `docs/workflow`.

If one repository needs multiple isolated workflow surfaces, create a named workstream:

```bash
npm run workflow:switch-workstream -- --name yahoo-sync --create
```

This creates a parallel surface such as `docs/yahoo-sync/` and records it in `WORKSTREAMS.md`.

Use named workstreams when:

- one repo contains multiple long-running initiatives
- the default control plane becomes too noisy
- you want independent milestone history and handoff state for a specific stream

## Validation, handoff, and closeout

This kit treats completion as more than "the code changed."

- `VALIDATION.md` defines the audit contract
- `HANDOFF.md` records where to resume if work pauses
- `WINDOW.md` helps avoid starting work that does not fit the current context budget
- `CARRYFORWARD.md` keeps unfinished but still-relevant items alive
- `completed_milestones/` stores milestone archives so active files stay small

The starter kit intentionally ships with an empty `completed_milestones/` archive.

## Recommended operating model

- Use workflow only when the user explicitly asks for it or when resuming an already-open workflow milestone.
- Treat `EXECPLAN.md` as the only canonical plan source during execution.
- Keep `STATUS.md` limited to the active window, not historical changelog data.
- Use `SEEDS.md` for future ideas and `CARRYFORWARD.md` for unfinished active work. They are not the same thing.
- Run `workflow:health -- --strict` before closeout when the profile or task requires strong validation discipline.

## Repository status

This repo is already cleaned up as a generic starter kit:

- example completed milestone archives were removed
- template documents were reset to a generic idle state
- the root README and script surface were added for reuse
- the repo has been initialized and published as its own standalone GitHub repository

## Notes

- The default workflow root is `docs/workflow`.
- The workflow is explicit opt-in, not a mandatory wrapper around every task.
- The templates intentionally start in an idle, starter-safe state with `pending_sync` values where runtime hashes should later be computed.
