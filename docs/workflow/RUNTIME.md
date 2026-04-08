# RUNTIME

- Last updated: `2026-04-03`
- Runtime status: `documented`
- Default workflow root: `docs/workflow`
- Default compare script: `scripts/compare_golden_snapshots.ts`

## Core Commands

- `npm run raiola:hud`
- `npm run raiola:map-codebase`
- `npm run raiola:map-frontend`
- `npm run raiola:control -- --utterance "plan kismini gecelim"`
- `npm run raiola:step-fulfillment -- --utterance "plan kismini gecelim"`
- `npm run raiola:delegation-plan`
- `npm run raiola:plan-check -- --strict`
- `npm run raiola:milestone -- --id Mx --name "..." --goal "..." --profile standard --automation manual`
- `npm run raiola:automation -- --mode phase`
- `npm run raiola:checkpoint -- --next "..."`
- `npm run raiola:complete-milestone -- --agents-review unchanged --summary "..."`
- `npm run raiola:save-memory -- --title "..." --note "..."`
- `npm run raiola:packet -- --step plan --json`
- `npm run raiola:next`
- `npm run raiola:pause-work -- --summary "..."`
- `npm run raiola:resume-work`
- `npm run raiola:doctor`
- `npm run raiola:health -- --strict`
- `npm run raiola:forensics`
- `npm run raiola:workstreams status`
- `npm run raiola:workstreams progress`
- `npm run raiola:workstreams create -- --name "<slug>"`
- `npm run raiola:workstreams switch -- --name "<slug>"`
- `npm run raiola:ensure-isolation -- --root docs/workflow`
- `npm run raiola:plant-seed -- --title "..." --trigger "..."`

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
- `raiola:automation` updates the canonical automation state so this behavior is visible in the Codex app as well as the CLI

## Git Runtime Notes

- `complete_milestone` defaults toward commit + push closeout behavior
- If the worktree is dirty, the script requires explicit `--stage-paths` or a deliberate `--allow-workflow-only`
- `PREFERENCES.md` records the workflow's branch/worktree isolation expectation
- `raiola:workstreams switch` automatically runs `raiola:ensure-isolation` unless you pass `--no-isolation`
- `ensure_isolation.js` sets or validates `none|branch|worktree` behavior and can provision a real branch/worktree
- `team` mode forces branch isolation and keeps `raiola:health -- --strict` as the pre-closeout gate

## Validation Runtime Notes

- `VALIDATION.md` is the canonical source for the audit contract
- During planning, acceptance criteria, user-visible outcomes, regression focus, verify commands, expected signals, manual checks, golden refs, and evidence should be written there
- When frontend mode is active, `VALIDATION.md` should also carry the frontend audit mode fields and the visual verdict protocol
- During audit, the commands actually run should be read from `STATUS.md` and `VALIDATION.md`

## Plan Check Runtime Notes

- `raiola:plan-check` is the quality gate between planning and execute
- It checks:
  - `plan-ready`
  - `coverage pass/fail`
  - `counterexample / falsification pass`
  - `anti-horizontal slicing`
  - `success criteria observability`
- `pending` means the packet is incomplete but not yet structurally wrong
- `fail` means the plan shape is wrong and must be revised
- Use `--sync` when you want the script to write `Plan readiness: yes` only after the gate passes

## Packet v5 Runtime Notes

- `Packet v5` is section-aware by default; prefer `docs/...#Section` packet refs over full-doc reads.
- Tier model:
  - `Tier A` -> continuity core
  - `Tier B` -> active chunk / active step surface
  - `Tier C` -> cold refs only on hash drift or explicit need
- `Token efficiency measures` in `PREFERENCES.md` control whether unchanged Tier A/B refs may be omitted on reruns:
  - `auto` -> mode-aware default
  - `on` -> delta loading stays active
  - `off` -> continuity_first keeps the broader packet loaded to reduce context-loss risk
- `raiola:tempo -- --utterance "hızlı geç"` or `--mode lite|standard|full` lets the user change ritual depth without hiding `Open Requirements`; `raiola:window` keeps the active token-efficiency state visible.
- `raiola:packet` and `raiola:window` surface:
  - `Checkpoint freshness`
  - `Core packet size`
  - `Loaded packet size`
  - `Unchanged refs omitted`
  - `Cold refs omitted`
- `execute` should keep the read set minimal:
  - `current chunk`
  - `open requirements`
  - `acceptance rows`
  - `touched files`
- `compact-now` and `do-not-start-next-step` should not compact blindly; if `Checkpoint freshness = no`, create a checkpoint first.

## Mapping Runtime Notes

- `raiola:map-codebase` writes:
  - `.workflow/codebase-map.json`
  - `.workflow/codebase-map.md`
  - `.workflow/codebase/STACK.md`
  - `.workflow/codebase/INTEGRATIONS.md`
  - `.workflow/codebase/ARCHITECTURE.md`
  - `.workflow/codebase/STRUCTURE.md`
  - `.workflow/codebase/TESTING.md`
  - `.workflow/codebase/CONCERNS.md`
- These are generated summaries with freshness metadata, not canonical state.
- `raiola:map-frontend` writes:
  - `<active workflow root>/FRONTEND_PROFILE.md`
  - `.workflow/frontend-profile.json`
- The frontend profile records active workstream scope, fingerprint inputs, refresh status, adapter routing, and visual verdict expectations.
- When frontend mode is active, the validation contract should expand beyond functional checks and include the visual verdict protocol.

## Frontend Runtime Notes

- Frontend auto mode activates only while workflow is active and frontend/UI signals are present.
- Activation signals include:
  - `React/TSX-heavy surface`
  - `components.json`
  - `Tailwind config`
  - `Storybook`
  - `Figma link`
  - `preview/browser/screenshot validation need`
  - `user intent such as landing page, frontend, UI, screen, component, design, responsive`
- When frontend mode is active:
  - `run raiola:map-frontend to refresh the profile and sync VALIDATION.md`
  - `prefer design-system-aware implementation choices`
  - `select adapters from the frontend registry`
  - `expand audit expectations to the visual verdict protocol`

## Team Lite Runtime Notes

- `raiola:delegation-plan` can do more than print a plan:
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
  - `Chosen strategy, rejected strategies, rollback/fallback, wave structure, and frontend routing when relevant are written`
  - `Coverage matrix has no orphan or duplicate requirements`
  - `raiola:plan-check passes before execute starts`
- `execute`
  - `Only ready chunks from the active wave were implemented`
  - `Status fields were updated`
  - `Off-plan drift was written back into docs`
- `audit`
  - `Verify commands were run`
  - `Manual checks and residual risks were written down`
  - `Frontend milestones also close the visual verdict protocol`
  - `Strict health is clean before complete`
- `complete`
  - `Archive output was written`
  - `Carryforward was decided`
  - `Git closeout scope was made explicit`

## Failure Playbook

- `Hash drift`
- `raiola:packet -- --all --sync -> raiola:window -- --sync -> raiola:health -- --strict`
- `Active root mismatch`
  - `raiola:workstreams status -> raiola:switch-workstream or use --root to return to the correct root`
- `Parallel routing uncertainty`
  - `raiola:map-codebase -> raiola:delegation-plan -- --activation-text "<user request>" -> raiola:delegation-plan -- --start only after write scopes are explicit`
- `Resume ambiguity`
  - `Read HANDOFF.md + WINDOW.md -> raiola:resume-work -> raiola:next`
- `Dirty worktree closeout`
  - `Use explicit --stage-paths in raiola:complete-milestone or --allow-workflow-only when it is truly docs-only`

## Resume Runtime Notes

- `HANDOFF.md` is the session-level pause/resume layer
- `WINDOW.md` stores the budget/orchestrator snapshot
- `raiola:checkpoint` refreshes the continuity checkpoint before handoff or compaction
- When automation is active and window pressure appears, prefer handoff/new-window recovery first when the client supports it; otherwise compact and continue from the remaining plan
- If `WINDOW.md` says `Checkpoint freshness = no`, checkpoint first and only then compact or hand off
- `MEMORY.md` stores active recall and durable memory
- `SEEDS.md` stores ideas to carry into a later milestone or workstream
- `.workflow/state.json` stores generated HUD/runtime state and should not be treated as canonical
- `.workflow/packet-state.json` stores the last synced section hashes used by Packet v5 delta loading and is also non-canonical
- `raiola:hud`, `raiola:doctor`, and `raiola:next` refresh `.workflow/state.json`
- The first command after `resume-work` should be `raiola:health -- --strict`

## Retro Runtime Notes

- `RETRO.md` is the process-quality surface; it is not the product validation state
- Update it after every `5` completed milestones, when a repeated forensics root cause appears, or when explicitly requested
- In `full` profile, it is good practice to actively check whether a retro note should be added during audit or complete
