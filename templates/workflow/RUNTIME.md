# RUNTIME

- Last updated: `2026-04-02`
- Runtime status: `documented`
- Default workflow root: `docs/workflow`
- Default compare script: `scripts/compare_golden_snapshots.ts`

## Core Commands

- `npm run workflow:hud`
- `npm run workflow:map-codebase`
- `npm run workflow:delegation-plan`
- `npm run workflow:plan-check -- --strict`
- `npm run workflow:new-milestone -- --id Mx --name "..." --goal "..." --profile standard --automation manual`
- `npm run workflow:automation -- --mode phase`
- `npm run workflow:complete-milestone -- --agents-review unchanged --summary "..."`
- `npm run workflow:save-memory -- --title "..." --note "..."`
- `npm run workflow:packet -- --step plan --json`
- `npm run workflow:next`
- `npm run workflow:pause-work -- --summary "..."`
- `npm run workflow:resume-work`
- `npm run workflow:doctor`
- `npm run workflow:health -- --strict`
- `npm run workflow:forensics`
- `npm run workflow:workstreams status`
- `npm run workflow:switch-workstream -- --name "<slug>"`
- `npm run workflow:plant-seed -- --title "..." --trigger "..."`

## Activation Notes

- The workflow protocol is not the default path; it opens only when explicitly requested by the user.
- If the user does not want workflow, continue with the normal task flow.
- One user request usually maps to one milestone.
- `discuss -> research -> plan -> execute -> audit -> complete` are steps inside the same milestone.
- `discuss` itself is split into `intent capture -> constraint extraction -> execution shaping`.
- Team Lite delegation is not active by default; it activates only with explicit parallel mode.
- Natural-language triggers that count as explicit Team Lite activation include:
  - `parallel yap`
  - `subagent kullan`
  - `delegate et`
  - `team mode`

## Workflow Profiles

- `lite`
  - `Small tasks, minimal ritual, short packets`
- `standard`
  - `Default general-purpose profile`
- `full`
  - `Real handoff/closeout, multi-session tracking, and process-quality notes`

## Automation Profiles

- `manual`
  - `Stop at major workflow transitions unless the user explicitly asks to continue`
- `phase`
  - `Codex may finish the current phase and stop at the next phase boundary`
- `full`
  - `Codex may keep moving phase-to-phase until blocked, complete, or window-managed`
- `workflow:automation` updates the canonical automation state so this behavior is visible in the Codex app as well as the CLI

## Git Runtime Notes

- `complete_milestone` defaults toward commit + push closeout behavior
- If the worktree is dirty, the script requires explicit `--stage-paths` or a deliberate `--allow-workflow-only`
- `PREFERENCES.md` records the workflow's branch/worktree isolation expectation
- `ensure_isolation.js` sets or validates `none|branch|worktree` behavior

## Validation Runtime Notes

- `VALIDATION.md` is the canonical source for the audit contract
- During planning, acceptance criteria, user-visible outcomes, regression focus, verify commands, expected signals, manual checks, golden refs, and evidence should be written there
- During audit, the commands actually run should be read from `STATUS.md` and `VALIDATION.md`

## Plan Check Runtime Notes

- `workflow:plan-check` is the quality gate between planning and execute
- It checks:
  - `plan-ready`
  - `coverage pass/fail`
  - `anti-horizontal slicing`
  - `success criteria observability`
- `pending` means the packet is incomplete but not yet structurally wrong
- `fail` means the plan shape is wrong and must be revised
- Use `--sync` when you want the script to write `Plan readiness: yes` only after the gate passes

## Mapping Runtime Notes

- `workflow:map-codebase` writes:
  - `.workflow/codebase-map.json`
  - `.workflow/codebase-map.md`
  - `.workflow/codebase/STACK.md`
  - `.workflow/codebase/INTEGRATIONS.md`
  - `.workflow/codebase/ARCHITECTURE.md`
  - `.workflow/codebase/STRUCTURE.md`
  - `.workflow/codebase/TESTING.md`
  - `.workflow/codebase/CONCERNS.md`
- These are generated summaries with freshness metadata, not canonical state.

## Team Lite Runtime Notes

- `workflow:delegation-plan` can do more than print a plan:
  - `--start` creates orchestration state and task packets
  - `--status` shows wave progress and the next route
  - `--task-packet <task-id>` prints the packet for a role task
  - `--complete-task <task-id> --summary "..."` ingests child/main results
  - `--advance` activates the next wave once the current wave is finished
- Runtime state lives under `.workflow/orchestration/`.

## Minimum Done

- `discuss`
  - `Intent capture, constraint extraction, and execution shaping are complete`
  - `User intent, explicit constraints, success rubric, and requirement list are filled in`
  - `Scope is framed with evidence`
- `research`
  - `Touched files are known`
  - `Dependency map and risks are filled in`
  - `Validation contract is narrowed to milestone scope`
- `plan`
  - `Chosen strategy, rejected strategies, rollback/fallback, and wave structure are written`
  - `Coverage matrix has no orphan or duplicate requirements`
  - `workflow:plan-check passes before execute starts`
- `execute`
  - `Only the active chunk was implemented`
  - `Status fields were updated`
  - `Off-plan drift was written back into docs`
- `audit`
  - `Verify commands were run`
  - `Manual checks and residual risks were written down`
  - `Strict health is clean before complete`
- `complete`
  - `Archive output was written`
  - `Carryforward was decided`
  - `Git closeout scope was made explicit`

## Failure Playbook

- `Hash drift`
- `workflow:packet -- --all --sync -> workflow:window -- --sync -> workflow:health -- --strict`
- `Active root mismatch`
  - `workflow:workstreams status -> workflow:switch-workstream or use --root to return to the correct root`
- `Parallel routing uncertainty`
  - `workflow:map-codebase -> workflow:delegation-plan -- --activation-text "<user request>" -> workflow:delegation-plan -- --start only after write scopes are explicit`
- `Resume ambiguity`
  - `Read HANDOFF.md + WINDOW.md -> workflow:resume-work -> workflow:next`
- `Dirty worktree closeout`
  - `Use explicit --stage-paths in workflow:complete-milestone or --allow-workflow-only when it is truly docs-only`

## Resume Runtime Notes

- `HANDOFF.md` is the session-level pause/resume layer
- `WINDOW.md` stores the budget/orchestrator snapshot
- When automation is active and window pressure appears, prefer handoff/new-window recovery first when the client supports it; otherwise compact and continue from the remaining plan
- `MEMORY.md` stores active recall and durable memory
- `SEEDS.md` stores ideas to carry into a later milestone or workstream
- `.workflow/state.json` stores generated HUD/runtime state and should not be treated as canonical
- `workflow:hud`, `workflow:doctor`, and `workflow:next` refresh `.workflow/state.json`
- The first command after `resume-work` should be `workflow:health -- --strict`

## Retro Runtime Notes

- `RETRO.md` is the process-quality surface; it is not the product validation state
- Update it after every `5` completed milestones, when a repeated forensics root cause appears, or when explicitly requested
- In `full` profile, it is good practice to actively check whether a retro note should be added during audit or complete
