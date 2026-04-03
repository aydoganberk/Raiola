# codex-workflow-kit

`codex-workflow-kit` is a reusable starter kit for bringing structured Codex workflow discipline into another repository.

It gives you a ready-made control plane for work that spans multiple sessions, needs explicit handoff and resume support, or benefits from milestone-based planning, validation, and closeout.

## What this kit includes

- `templates/workflow/`
  Starter workflow documents intended to live under `docs/workflow/` in the target repository.
- `scripts/workflow/`
  Helper scripts for installation, migration, milestone creation, health checks, HUD/state generation, handoff, validation, and workstream switching.
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

- `discuss` moves through `intent capture -> constraint extraction -> execution shaping`
- `research` identifies touched files, dependencies, risks, and verification surface
- `plan` writes the canonical implementation plan, coverage matrix, and validation mapping into `EXECPLAN.md`
- `execute` applies only the active chunk of work
- `audit` runs validation checks and records residual risks
- `complete` archives the milestone, cleans up active recall, and prepares closeout

The workflow also supports milestone-scoped automation:

- `manual`
  Codex pauses at major transitions unless the user explicitly asks to continue.
- `phase`
  Codex may complete the current phase end-to-end, then stop at the next phase boundary.
- `full`
  Codex may continue phase-to-phase until blocked, complete, or window-managed.

This is designed to work in the Codex app as well as the CLI. The canonical contract lives in the workflow docs (`STATUS.md`, `CONTEXT.md`, `HANDOFF.md`, `WINDOW.md`), so automation state is visible and resumable across sessions.

## Install into another repository

The intended installer path is now one command:

```bash
node /path/to/codex-workflow-kit/scripts/workflow/init.js --target /path/to/target-repo
```

What that command does:

- installs `docs/workflow/`
- copies target-safe runtime scripts into `scripts/workflow/`
- copies `scripts/compare_golden_snapshots.ts`
- installs the repo-local skill at `.agents/skills/codex-workflow/SKILL.md`
- patches the target repo's `package.json` with runtime workflow scripts
- if the target repo has no `package.json`, creates a minimal one so `npm run workflow:*` works immediately
- runs `doctor`, `health`, `next`, and `hud`
- writes generated runtime state to `.workflow/state.json`

If you want a starter `AGENTS.md` patch template as well:

```bash
node /path/to/codex-workflow-kit/scripts/workflow/init.js --target /path/to/target-repo --write-agents-template
```

For an already-installed repository, use migration instead of rebuilding by hand:

```bash
node /path/to/codex-workflow-kit/scripts/workflow/migrate.js --target /path/to/target-repo
```

By default, migrate preserves existing workflow markdown and only fills missing files while refreshing runtime scripts.

## Quick start in a target repo

Once installed, these are the first commands to run:

```bash
npm run workflow:hud -- --compact
npm run workflow:map-codebase -- --compact
npm run workflow:doctor -- --strict
npm run workflow:health -- --strict
npm run workflow:plan-check -- --strict
npm run workflow:next
```

If the surface is clean, open the first milestone:

```bash
npm run workflow:new-milestone -- --id M1 --name "Initial setup" --goal "Set up the first workflow-backed task" --profile standard --automation manual
```

To switch automation mode later:

```bash
npm run workflow:automation -- --mode phase
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
npm run workflow:new-milestone -- --id Mx --name "..." --goal "..." --profile standard --automation manual
npm run workflow:automation -- --mode phase
npm run workflow:complete-milestone -- --agents-review unchanged --summary "..."
npm run workflow:next
npm run workflow:hud
npm run workflow:map-codebase
npm run workflow:delegation-plan
npm run workflow:plan-check -- --sync --strict
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
npm run workflow:workstreams progress
npm run workflow:workstreams create -- --name "<slug>"
npm run workflow:workstreams switch -- --name "<slug>" --create
npm run workflow:ensure-isolation -- --root docs/workflow
npm run workflow:switch-workstream -- --name "<slug>" --create
npm run workflow:compare-golden -- --help
```

If your repo does not use `npm`, run the same underlying `node` commands directly or mirror these script names in your preferred package manager.

## Named workstreams

The default root is `docs/workflow`.

If one repository needs multiple isolated workflow surfaces, create a named workstream:

```bash
npm run workflow:workstreams create -- --name yahoo-sync
npm run workflow:workstreams switch -- --name yahoo-sync
```

This creates a parallel surface such as `docs/yahoo-sync/` and records it in `WORKSTREAMS.md`.

To see the whole repo at once:

```bash
npm run workflow:workstreams progress
```

That command refreshes the registry and shows which streams are stale, which ones are out of packet/window budget, and which roots need attention.

Use named workstreams when:

- one repo contains multiple long-running initiatives
- the default control plane becomes too noisy
- you want independent milestone history and handoff state for a specific stream

If a stream expects git isolation, `workflow:workstreams switch` now runs `workflow:ensure-isolation` automatically so `branch` and `worktree` modes do real setup instead of staying advisory.

## Validation, handoff, and closeout

This kit treats completion as more than "the code changed."

- `VALIDATION.md` defines the audit contract
- `HANDOFF.md` records where to resume if work pauses
- `WINDOW.md` helps avoid starting work that does not fit the current context budget
- `.workflow/state.json` is generated runtime state for HUD-style summaries; it is not canonical
- `workflow:hud`, `workflow:doctor`, and `workflow:next` all refresh `.workflow/state.json`
- `.workflow/codebase-map.json` and `.workflow/delegation-plan.json` are generated orchestration aides; they are not canonical
- `.workflow/codebase/STACK.md`, `INTEGRATIONS.md`, `ARCHITECTURE.md`, `STRUCTURE.md`, `TESTING.md`, and `CONCERNS.md` are generated mapping surfaces; they are not canonical
- `CARRYFORWARD.md` keeps unfinished but still-relevant items alive
- `completed_milestones/` stores milestone archives so active files stay small

The starter kit intentionally ships with an empty `completed_milestones/` archive.

## Recommended operating model

- Use workflow only when the user explicitly asks for it or when resuming an already-open workflow milestone.
- Treat `EXECPLAN.md` as the only canonical plan source during execution.
- Keep `STATUS.md` limited to the active window, not historical changelog data.
- Use `SEEDS.md` for future ideas and `CARRYFORWARD.md` for unfinished active work. They are not the same thing.
- Run `workflow:health -- --strict` before closeout when the profile or task requires strong validation discipline.
- Run `workflow:plan-check -- --sync --strict` before execute so `plan-ready=yes` is written only after the quality gate passes.
- Treat `workflow:plan-check -> pending` as "the packet is incomplete" and `fail` as "the plan shape is wrong".
- Use `Reasoning profile: fast|balanced|deep|critical` on packets when a step needs a lighter or stricter thinking budget.
- Keep `What Would Falsify This Plan?` explicit in `EXECPLAN.md` and `VALIDATION.md`; plan/audit packets now treat that counterexample pass as mandatory.

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
- Installer commands live in the starter kit repo; target repos receive the runtime commands they actually need day to day.
- Team Lite delegation remains explicit: activate it only with explicit user language or `--parallel`, and only after read/write ownership is clear.

## Team Lite orchestration

`workflow:delegation-plan` now has two layers:

- planning: route work into `main`, `explorer`, `planner`, `checker`, `worker`, `verifier`, and `debugger`
- orchestration: create wave state, task packets, result ledgers, and next-route decisions

Natural-language activation is supported through explicit phrases such as:

- `parallel yap`
- `subagent kullan`
- `delegate et`
- `team mode`

Typical flow:

```bash
npm run workflow:map-codebase
npm run workflow:delegation-plan -- --start --intent research --activation-text "parallel yap"
npm run workflow:delegation-plan -- --status --compact
npm run workflow:delegation-plan -- --task-packet wave1-explorer-stack
npm run workflow:delegation-plan -- --complete-task wave1-explorer-stack --summary "..."
npm run workflow:delegation-plan -- --advance
```
