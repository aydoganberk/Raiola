# EXECPLAN

This file is the live master plan for the active workflow control plane in the repository.

Usage rule:

- If there is only one active stream, keep this file current.
- If a separate stream is needed, copy the same artifact set into `docs/<workstream>/` and make that root canonical.
- If multiple active streams exist, each one should have its own `EXECPLAN.md`, `STATUS.md`, `DECISIONS.md`, `MILESTONES.md`, `CONTEXT.md`, `CARRYFORWARD.md`, `VALIDATION.md`, `HANDOFF.md`, `WINDOW.md`, `MEMORY.md`, `SEEDS.md`, and `RETRO.md`.

- Packet version: `4`
- Input hash: `pending_sync`
- Budget profile: `normal`
- Target input tokens: `12000`
- Hard cap tokens: `20000`
- Reasoning profile: `deep`
- Confidence summary: `starter_surface_waiting_for_first_milestone`
- Refresh policy: `refresh_when_context_hash_drifts`
- Current step mode: `explicit`
- Step fulfillment state: `idle`
- Last control intent: `none`

## Canonical Refs

| Class | Ref | Why |
| --- | --- | --- |
| source_of_truth | docs/workflow/CONTEXT.md | Research packet dependency |
| source_of_truth | docs/workflow/MILESTONES.md | Active milestone / step truth |
| source_of_truth | docs/workflow/PREFERENCES.md | Budget and isolation policy |

## Upstream Refs

| Class | Ref | Why |
| --- | --- | --- |
| supporting | docs/workflow/VALIDATION.md | Audit plan dependency |
| supporting | docs/workflow/WINDOW.md | Current window budget state |
| supporting | docs/workflow/CARRYFORWARD.md | Open work carried into plan |

## Scope

- Workstream: `Default workflow control plane`
- Owner: `Codex + repo collaborators`
- Goal: `Keep the starter workflow surface ready for the first milestone`
- Non-goals:
  - `Implementing product feature or refactor work at this stage`

## Session Protocol

Every new Codex session should start in this order:

1. Read `AGENTS.md`.
2. Resolve the active root from `docs/workflow/WORKSTREAMS.md`.
3. In that root, read `PROJECT.md`, `RUNTIME.md`, `PREFERENCES.md`, `EXECPLAN.md`, `STATUS.md`, `DECISIONS.md`, `MILESTONES.md`, `CONTEXT.md`, `CARRYFORWARD.md`, `VALIDATION.md`, `HANDOFF.md`, `WINDOW.md`, and `SEEDS.md`.
4. If `MEMORY.md` contains `Active Recall Items` for the active milestone, read them automatically.
5. Use `workflow:next` to check the recommended next move for the active step.
6. Summarize the current state in `8-12` bullets.
7. Operate only within the active phase, active milestone, and active milestone step.

Additional rules:

- The first check after `resume-work` should be `workflow:health -- --strict`.
- This protocol is fully applied only when the user explicitly wants workflow or when resuming an already-open workflow milestone.
- If workflow is not active, this file stays as a reference surface and normal task flow can continue without opening a milestone.
- `Workflow profile` in `PREFERENCES.md` (`lite|standard|full`) controls ritual intensity.

## Milestone Loop

1. `discuss`
   - Scan the codebase first.
   - Follow `Discuss mode` from `PREFERENCES.md` using either `assumptions` or `interview`.
   - Complete `intent capture -> constraint extraction -> execution shaping`.
   - Write user intent, explicit constraints, alternatives considered, success rubric, requirement list, seed intake, active recall intake, claim ledger, and unknowns into `CONTEXT.md`.
2. `research`
   - Gather touched files, dependencies, verification surface, and risks.
   - Update `CONTEXT.md` with research findings.
   - Narrow `VALIDATION.md` acceptance criteria, user-visible outcomes, regression focus, and validation rows to milestone scope.
3. `plan`
   - Start only when `CONTEXT.md` is current after research.
   - Read `CARRYFORWARD.md` and any relevant seeds.
   - Write the source-of-truth plan into the `Plan of Record`, `Chosen Strategy`, `Wave Execution Policy`, `Wave Structure`, `Coverage Matrix`, `Plan Chunk Table`, and `Commit Policy` sections of `EXECPLAN.md`.
   - Split execute into `wave 1 -> wave 2 -> wave 3`, keep each chunk run-sized, and avoid more same-wave parallelism than the dependency graph can justify.
   - Unused waves should be marked `not needed` instead of silently removed so execute stays resumable and inspectable.
   - Keep the plan small enough to fit the current window and pass `workflow:plan-check` before execute begins.
4. `execute`
   - Apply only the work in the active milestone plan.
   - Execute `wave 1`, then `wave 2`, then `wave 3`; do not start a later wave while an earlier wave is still open.
   - Only dependency-free chunks may run in the same wave.
   - Parallel workers must be opened dependency-aware from the planned wave/chunk rows; never fan out randomly.
   - Same-wave write-capable workers must have explicit ownership and disjoint write scopes.
   - The orchestrator delegates, waits, integrates, updates `EXECPLAN.md` and `STATUS.md`, then decides whether the next wave can start.
   - If `Atomic commit mode` is enabled for the milestone, commit only at the declared `wave` or `chunk` boundary.
   - If needed, leave an active recall note with `workflow:save-memory`.
5. `audit`
   - Use the contract table in `VALIDATION.md` to run tests, diff review, or smoke checks.
   - Write the outcome and remaining risks into `STATUS.md`.
6. `complete`
   - Write the exit condition, validation snapshot, and recommended next milestone.
   - Move unfinished but still-important items into `CARRYFORWARD.md`.
   - Archive the milestone summary under `completed_milestones/`.
   - Remove `Active Recall Items` tied to the milestone from `MEMORY.md`.
   - Check whether `AGENTS.md` needs an update.
   - Do not close out while `workflow:health -- --strict` is not clean.

## Minimum Done Checklists

- `discuss`
  - `Intent capture, constraint extraction, and execution shaping are complete`
  - `User intent, explicit constraints, success rubric, and requirement list are filled in`
  - `Scope is framed with evidence`
- `research`
  - `Touched files are known`
  - `Dependency map and risks are filled in`
  - `Acceptance criteria, user-visible outcomes, regression focus, and validation contract are narrowed to milestone scope`
- `plan`
  - `Chosen strategy, rejected strategies, rollback/fallback, blockers, wave execution policy, chunks, and commit policy are written`
  - `Coverage matrix has no orphan or duplicate requirements`
  - `workflow:plan-check passes before execute begins`
- `execute`
  - `Only ready chunks from the active wave were implemented`
  - `Same-wave work was dependency-free and had disjoint write scopes`
  - `Status fields were updated`
  - `Integration order and any atomic commit checkpoints were written down`
  - `Off-plan drift was written back into docs`
- `audit`
  - `Verify commands were run`
  - `Manual checks and residual risks were written down`
  - `Strict health gate is clean`
- `complete`
  - `Archive output was written`
  - `Carryforward was decided`
  - `Git closeout scope was made explicit`

## Unknowns

| Unknown | Impact | Owner | Status |
| --- | --- | --- | --- |
| `The scope of the first active milestone` | `Directly changes the Plan of Record packet` | `user` | `open` |

## Milestone Model

- Active milestone source: `MILESTONES.md`
- Active context source: `CONTEXT.md`
- Active validation source: `VALIDATION.md`
- Active handoff source: `HANDOFF.md`
- Active window source: `WINDOW.md`
- Active seed source: `SEEDS.md`
- Active root source: `WORKSTREAMS.md`
- Only one milestone should be `active` at a time.
- Only one milestone step should be `active` at a time.
- `Plan of Record` is the sole source of truth for the plan step.
- `CONTEXT.md` resets at the start of each new milestone.
- `STATUS.md` and `EXECPLAN.md` stay in sync on active milestone and step fields.
- `AGENTS.md` combined size defaults to `32 KiB`; split supporting docs if needed.
- Default granularity is one user request = one milestone, with lifecycle steps inside it.

## Active Phase

- Current phase: `Phase 0 - Idle`
- Active milestone: `NONE`
- Active milestone step: `complete`
- Entry criteria: `The user explicitly wants to open a workflow milestone`
- Exit criteria: `The first active milestone is opened`
- In scope now:
  - `Keeping the workflow surface idle and clean`
  - `Opening workflow only when explicitly requested`
- Explicitly out of scope now:
  - `Starting milestone planning without an explicit user request`

## Phase Ladder

| Phase | Name | Status | Exit signal |
| --- | --- | --- | --- |
| 0 | Idle / Ready | active | The user can open a milestone if needed |
| 1 | Discuss / Research | pending | Scope is clear and context is ready |
| 2 | Execute / Audit | pending | Validation is clean |
| 3 | Complete / Handoff | pending | Closeout or pause is ready |

## Plan of Record

- Milestone: `NONE`
- Step owner: `plan`
- Plan status: `idle_until_user_opens_milestone`
- Plan-ready gate: `pending`
- Carryforward considered: `None`
- Run chunk id: `NONE`
- Run chunk hash: `pending`
- Chunk cursor: `0/0`
- Active wave: `0/3`
- Wave status: `idle`
- Wave advancement rule: `dependency_free_only`
- Worker orchestration: `dependency_aware`
- Commit granularity default: `manual`
- Atomic commit mode: `off`
- Completed items: `None`
- Remaining items: `Open the first milestone if needed`
- Resume from item: `Milestone open`
- Estimated packet tokens: `0`
- Estimated execution overhead: `2000`
- Estimated verify overhead: `1000`
- Minimum reserve: `16000`
- Safe in current window: `yes`
- Current run chunk:
  - `None`
- Next run chunk:
  - `Open the first milestone if needed`
- Implementation checklist:
  - `None`
- Audit plan:
  - `None`
- Out-of-scope guardrails:
  - `Do not start milestone planning without an explicit user request`

## Chosen Strategy

- `Fill when an active milestone reaches execution shaping / plan`

## Wave Execution Policy

- `Execute follows wave 1 -> wave 2 -> wave 3.`
- `Wave 1 carries dependency-free foundation or prep slices.`
- `Wave 2 may start only after wave 1 is integrated and only for work that depends on completed wave 1 outputs.`
- `Wave 3 closes the execute loop with final integration, shared-surface work, or execution-level cleanup.`
- `Only dependency-free chunks may share a wave. If a dependency is unclear, serialize it or move it to a later wave.`
- `Every write-capable chunk must name an owner and explicit write scope before a worker can be opened.`
- `Unused waves must be marked not needed rather than omitted so resume logic can see the intended execution shape.`

## Rejected Strategies

- `Document the alternatives that were considered and deliberately not chosen`

## Rollback / Fallback

- `Describe what we will revert, disable, or narrow if the chosen strategy fails`

## Dependency Blockers

| Blocker | Type | Owner | Status | Unblock signal |
| --- | --- | --- | --- | --- |
| `None currently` | `none` | `n/a` | `clear` | `Replace this row if a real blocker appears` |

## Wave Structure

| Wave | Chunks | Goal | Depends on | Parallel rule | Owners / write scope | Integration order | Commit boundary |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `1` | `chunk-1` | `Dependency-free foundation or prep slice` | `none` | `Only independent chunks may run together` | `Fill owners and paths` | `Integrate wave 1 before wave 2 opens` | `manual` |
| `2` | `chunk-2` | `Build on completed wave 1 outputs` | `wave-1` | `Only chunks that depend only on completed wave 1 work` | `Fill owners and paths` | `Integrate after all wave 2 work is complete` | `manual` |
| `3` | `chunk-3` | `Final integration, shared-surface work, or execute closeout` | `wave-1, wave-2` | `Prefer serialized or narrowly parallel work` | `Fill owners and paths` | `Close execute before audit begins` | `manual` |

## Coverage Matrix

| Requirement ID | Milestone | Capability slice | Plan chunk | Validation ID | Notes |
| --- | --- | --- | --- | --- | --- |
| `R0` | `NONE` | `Fill when planning starts` | `chunk-1` | `AC0` | `Replace this placeholder before execute` |

## Plan Chunk Table

| Chunk ID | Capability slice | Deliverable | Depends on | Wave | Owner | Write scope | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `chunk-1` | `Fill when planning starts` | `Describe the dependency-free slice this chunk delivers` | `none` | `1` | `main` | `Fill owned paths before execute` | `pending` |
| `chunk-2` | `Fill when planning starts` | `Describe the wave 2 slice this chunk delivers` | `chunk-1` | `2` | `main` | `Fill owned paths before execute` | `pending` |
| `chunk-3` | `Fill when planning starts` | `Describe the wave 3 integration slice this chunk delivers` | `chunk-1, chunk-2` | `3` | `main` | `Fill owned paths before execute` | `pending` |

## Commit Policy

- `Preference source: PREFERENCES.md -> Commit granularity`
- `Commit granularity: manual`
- `Atomic commit mode: off`
- `If atomic commit mode = wave, only commit after a whole wave has been integrated.`
- `If atomic commit mode = chunk, only commit after a single chunk has been integrated.`
- `If atomic commit mode = off, stay manual and use the normal milestone closeout path unless the user explicitly wants otherwise.`

## What Would Falsify This Plan?

- `If the CONTEXT input hash changes without being refreshed before the plan step, this plan is stale`
- `If WINDOW budget is insufficient for the next step, the same chunk is no longer safe`
- `If same-wave chunks have overlapping write scope or hidden dependencies, the wave plan is unsafe`

## Deliverables

- `PROJECT.md` explains why the workflow exists and what it optimizes for
- `RUNTIME.md` stores operational commands and runtime notes
- `PREFERENCES.md` stores solo/team mode, discuss mode, and git isolation behavior
- `PREFERENCES.md` also stores the repo-default commit granularity preference
- `VALIDATION.md` stores the audit contract
- `HANDOFF.md` stores the session-level pause/resume snapshot
- `WINDOW.md` stores context-budget and resume-cursor state
- `SEEDS.md` stores future ideas
- `RETRO.md` stores process quality and self-improvement backlog
- `WORKSTREAMS.md` stores the active root and switch log
- `tests/golden/workflow/` can be used as workflow-level golden surface

## Notes

- `This file is not a backlog; it is only the canonical plan for the active stream`
- `Wave Structure and Plan Chunk Table are execution-control artifacts, not just descriptive notes`
- `workflow:packet`, `workflow:next`, `workflow:pause-work`, `workflow:resume-work`, `workflow:doctor`, `workflow:health`, and `workflow:forensics` support the operational layer`
- `complete_milestone` does not auto-commit outside workflow-only changes without explicit scope`
