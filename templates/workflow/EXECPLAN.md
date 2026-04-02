# EXECPLAN

This file is the live master plan for the active workflow control plane in the repository.

Usage rule:

- If there is only one active stream, keep this file current.
- If a separate stream is needed, copy the same artifact set into `docs/<workstream>/` and make that root canonical.
- If multiple active streams exist, each one should have its own `EXECPLAN.md`, `STATUS.md`, `DECISIONS.md`, `MILESTONES.md`, `CONTEXT.md`, `CARRYFORWARD.md`, `VALIDATION.md`, `HANDOFF.md`, `WINDOW.md`, `MEMORY.md`, `SEEDS.md`, and `RETRO.md`.

- Packet version: `2`
- Input hash: `pending_sync`
- Budget profile: `normal`
- Target input tokens: `12000`
- Hard cap tokens: `20000`
- Reasoning profile: `deep`
- Confidence summary: `starter_surface_waiting_for_first_milestone`
- Refresh policy: `refresh_when_context_hash_drifts`

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
   - Write problem framing, seed intake, active recall intake, claim ledger, and unknowns into `CONTEXT.md`.
2. `research`
   - Gather touched files, dependencies, verification surface, and risks.
   - Update `CONTEXT.md` with research findings.
   - Narrow `VALIDATION.md` to milestone scope.
3. `plan`
   - Start only when `CONTEXT.md` is current after research.
   - Read `CARRYFORWARD.md` and any relevant seeds.
   - Write the source-of-truth plan into the `Plan of Record` section of `EXECPLAN.md`.
   - Keep the plan small enough to fit into `1-2` run-sized chunks.
4. `execute`
   - Apply only the work in the active milestone plan.
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
  - `Audit plan and overhead fields are filled in`
- `execute`
  - `Only the active chunk was implemented`
  - `Status fields were updated`
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
- Carryforward considered: `None`
- Run chunk id: `NONE`
- Run chunk hash: `pending`
- Chunk cursor: `0/0`
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

## What Would Falsify This Plan?

- `If the CONTEXT input hash changes without being refreshed before the plan step, this plan is stale`
- `If WINDOW budget is insufficient for the next step, the same chunk is no longer safe`

## Deliverables

- `PROJECT.md` explains why the workflow exists and what it optimizes for
- `RUNTIME.md` stores operational commands and runtime notes
- `PREFERENCES.md` stores solo/team mode, discuss mode, and git isolation behavior
- `VALIDATION.md` stores the audit contract
- `HANDOFF.md` stores the session-level pause/resume snapshot
- `WINDOW.md` stores context-budget and resume-cursor state
- `SEEDS.md` stores future ideas
- `RETRO.md` stores process quality and self-improvement backlog
- `WORKSTREAMS.md` stores the active root and switch log
- `tests/golden/workflow/` can be used as workflow-level golden surface

## Notes

- `This file is not a backlog; it is only the canonical plan for the active stream`
- `workflow:packet`, `workflow:next`, `workflow:pause-work`, `workflow:resume-work`, `workflow:doctor`, `workflow:health`, and `workflow:forensics` support the operational layer`
- `complete_milestone` does not auto-commit outside workflow-only changes without explicit scope`
