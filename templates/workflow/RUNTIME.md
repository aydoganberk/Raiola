# RUNTIME

- Last updated: `2026-04-02`
- Runtime status: `documented`
- Default workflow root: `docs/workflow`
- Default compare script: `scripts/compare_golden_snapshots.ts`

## Core Commands

- `npm run workflow:hud`
- `npm run workflow:map-codebase`
- `npm run workflow:delegation-plan`
- `npm run workflow:new-milestone -- --id Mx --name "..." --goal "..."`
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

## Git Runtime Notes

- `complete_milestone` defaults toward commit + push closeout behavior
- If the worktree is dirty, the script requires explicit `--stage-paths` or a deliberate `--allow-workflow-only`
- `PREFERENCES.md` records the workflow's branch/worktree isolation expectation
- `ensure_isolation.js` sets or validates `none|branch|worktree` behavior

## Validation Runtime Notes

- `VALIDATION.md` is the canonical source for the audit contract
- During planning, verify commands, expected signals, manual checks, golden refs, and evidence should be written there
- During audit, the commands actually run should be read from `STATUS.md` and `VALIDATION.md`

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
  - `Goal/non-goals/success signal are clear`
  - `Canonical refs and assumptions are filled in`
  - `Scope is framed with evidence`
- `research`
  - `Touched files are known`
  - `Dependency map and risks are filled in`
  - `Validation contract is narrowed to milestone scope`
- `plan`
  - `Context is plan-ready`
  - `1-2` run chunks are written
  - `Audit plan and overhead fields are written`
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
- `MEMORY.md` stores active recall and durable memory
- `SEEDS.md` stores ideas to carry into a later milestone or workstream
- `.workflow/state.json` stores generated HUD/runtime state and should not be treated as canonical
- `workflow:hud`, `workflow:doctor`, and `workflow:next` refresh `.workflow/state.json`
- The first command after `resume-work` should be `workflow:health -- --strict`

## Retro Runtime Notes

- `RETRO.md` is the process-quality surface; it is not the product validation state
- Update it after every `5` completed milestones, when a repeated forensics root cause appears, or when explicitly requested
- In `full` profile, it is good practice to actively check whether a retro note should be added during audit or complete
