# MILESTONES

This file stores delivery-focused progress points within the workstream.

Usage rules:

- Only one milestone should be `active` at a time.
- Only one milestone step should be `active` at a time.
- Every active milestone should move through `discuss -> research -> plan -> execute -> audit -> complete`.
- `CONTEXT.md` should be created by the end of discuss, updated by the end of research, and planning should begin only after that.
- `VALIDATION.md` should be narrowed during research/plan and closed during audit.
- `HANDOFF.md` is the session-level snapshot layer; milestone history should not accumulate there.
- `WINDOW.md` should decide budget/orchestrator readiness before a new step begins.
- `SEEDS.md` stores ideas that may surface later; `CARRYFORWARD.md` stores unfinished active work.

## Status Vocabulary

- `pending`
- `active`
- `blocked`
- `done`
- `dropped`

## Step Vocabulary

- `discuss`: codebase scan, goal framing, discuss-mode handling, and claim-ledger start
- `research`: touched file scan, dependencies, risks, and verification surface
- `plan`: writing `Plan of Record` into `EXECPLAN.md`
- `execute`: applying the planned changes
- `audit`: verification through `VALIDATION.md` and `STATUS.md`
- `complete`: archive, carryforward, memory cleanup, and git closeout

## Step Gate Rules

- Do not move from `discuss` to `research` before:
  - goal, success signal, and non-goals are clear
  - `Discuss mode` in `PREFERENCES.md` has been respected
  - `CONTEXT.md` has an initial snapshot
  - seed intake, active recall intake, canonical refs, and claim ledger are written
- Do not move from `research` to `plan` before:
  - likely touched files are listed
  - risks and dependencies are listed
  - verification surface is identified
  - the first validation scope contract exists in `VALIDATION.md`
  - `CONTEXT.md` is current after research
  - `CARRYFORWARD.md` has been reviewed
- Do not move from `plan` to `execute` before:
  - the plan is split into `1-2` run-sized chunks
  - the implementation checklist exists
  - the audit/test plan exists
  - `Plan of Record` in `EXECPLAN.md` is current
  - `WINDOW.md` says the next chunk can start
- Do not move from `execute` to `audit` before:
  - a summary of changes exists
  - scope expansion has been noted if it happened
  - active recall notes were saved if needed
- Do not move from `audit` to `complete` before:
  - commands/checks run are recorded
  - outcomes are recorded
  - residual risks are recorded
  - validation contract state is known
  - AGENTS review plan is known
  - git closeout scope is known
  - `raiola:health -- --strict` is clean
- Do not start planning the next milestone before the current one is `complete`
- Default granularity:
  - `One user request is usually modeled as one milestone`
  - `discuss -> research -> plan -> execute -> audit -> complete` are steps inside that milestone

## Active Milestone Rule

- This file must stay in sync with the `Active milestone` field in `EXECPLAN.md`.
- This file must stay in sync with the `Current milestone` field in `STATUS.md`.
- This file must stay in sync with the `Active milestone step` field in `EXECPLAN.md`.
- This file must stay in sync with the `Current milestone step` field in `STATUS.md`.
- The active milestone card, `CONTEXT.md`, `VALIDATION.md`, `WINDOW.md`, and active recall notes should all reflect the same scope.
- Completed milestone detail should not accumulate in the active card; it moves into `completed_milestones/`.

## Milestone Table

| Milestone | Goal | Phase | Status | Step | Exit criteria | Evidence / notes |
| --- | --- | --- | --- | --- | --- | --- |

## Archived Done Milestones

- `No archived milestones yet`

## Active Milestone Card

- Milestone: `NONE`
- Phase: `Idle`
- Status: `idle`
- Step: `complete`
- Goal:
  - `Wait for the first milestone to be explicitly opened`
- Success signal:
  - `The first milestone is explicitly defined by the user`
- Non-goals:
  - `Starting milestone planning without an explicit user request`
- Discuss mode:
  - `assumptions`
- Clarifying questions / assumptions:
  - `Workflow opens only through explicit user request`
- Seed intake:
  - `No open seeds yet`
- Active recall intake:
  - `No active milestone`
- Research target files:
  - `Fill this when a milestone opens`
- Plan checklist:
  - `Fill this when a milestone opens`
- Execute notes:
  - `None`
- Audit checklist:
  - `None`
- Completion note:
  - `Open the first milestone if the user wants workflow`

## Milestone Notes

- `raiola:packet` produces a step packet with a deterministic hash.
- `raiola:next` produces the recommended next move for the active step.
- `raiola:pause-work` and `raiola:resume-work` carry the execution cursor and packet snapshot.
- `raiola:health --strict` is the main gate.
- `raiola:workstreams create -- --name <slug>` scaffolds an inactive named root.
- `raiola:workstreams switch -- --name <slug> --create` creates and activates a named root in one move.
- `raiola:workstreams progress` shows which stream is stale or budget-out without opening each root manually.
- `Do not prefill active or pending milestones unless the user explicitly wants that`
