---
name: codex-workflow
description: "Repo workstream continuity protocol. Use only when the user explicitly asks for workflow/milestone/handoff/closeout discipline, or when resuming a workflow milestone they explicitly started."
---

# codex-workflow

This skill is used to run multi-session work inside a repository through one durable workflow protocol.
It is not the default path; if the user did not explicitly ask for workflow, continue with the normal task flow.

## When To Use

- When the user explicitly wants workflow, milestone, handoff, or closeout discipline
- When the user wants to continue a previously opened workflow milestone
- When named workstreams, validation contracts, or pause/resume snapshots are explicitly needed

## Granularity

- The default planning unit is a single milestone.
- One user request usually maps to one milestone.
- `discuss -> research -> plan -> execute -> audit -> complete` are steps within that milestone, not separate milestones.

## Workflow Profiles

- `lite`
  - `Small, short-lived, low-ritual tasks`
- `standard`
  - `Default general-purpose profile`
- `full`
  - `Real handoff/closeout, multi-session coordination, and process-quality tracking`
- `Workflow mode` and `Workflow profile` are different:
  - `mode` controls team/git isolation behavior
  - `profile` controls ritual depth and minimum-done expectations

## Startup Sequence

1. Read `AGENTS.md`.
2. Resolve the active workstream root from `docs/workflow/WORKSTREAMS.md`.
3. In that root, read:
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
4. If `MEMORY.md` contains `Active Recall Items` tied to the active milestone, read them automatically.
5. Read `Durable Notes` from `MEMORY.md` only if the user asked for durable memory or if it is genuinely necessary.
6. Summarize current state in `8-12` bullets.
7. Operate only within the active phase, active milestone, and active milestone step.

## Milestone Loop

An active milestone always follows this loop:

1. `discuss`
   - Scan the codebase first.
   - Follow the value of `Discuss mode` in `PREFERENCES.md`:
     - `assumptions`: read the codebase first, then write evidence-backed assumptions.
     - `interview`: clarify the goal first, then ask only high-leverage questions.
   - Write problem frame, scan summary, canonical refs, claim ledger, unknowns, seed intake, and active recall intake into `CONTEXT.md`.
2. `research`
   - Identify touched files, dependencies, risks, and verification surface.
   - Update `CONTEXT.md` with research findings.
   - Narrow the success contract, verify commands, and manual check fields in `VALIDATION.md` to the active milestone scope.
3. `plan`
   - Continue only if `CONTEXT.md` is current after research.
   - Read `CARRYFORWARD.md` and relevant seeds.
   - Write the source-of-truth plan into `Plan of Record` in `EXECPLAN.md`.
   - Split the plan into `1-2` run-sized chunks that fit the current context window.
   - If `WINDOW.md` and packet budget are insufficient for a new chunk, do not start a new step.
4. `execute`
   - Apply only the active milestone plan.
   - Leave active recall notes with `workflow:save-memory` if needed.
5. `audit`
   - Use the `VALIDATION.md` contract table for test, diff, review, or smoke checks.
   - Write the result and remaining risks into `STATUS.md`.
6. `complete`
   - Write evidence, remaining risks, and the recommended next milestone.
   - Move unfinished items into `CARRYFORWARD.md` if needed.
   - Archive milestone summary, final context, and validation snapshot under `completed_milestones/`.
   - Remove milestone-linked `Active Recall Items` from `MEMORY.md`.
   - Check whether `AGENTS.md` needs an update.
   - If audit is closed, apply commit and push protocol only while `workflow:health -- --strict` is clean.

## Minimum Done Checklists

- `discuss`
  - `Goal/non-goals/success signal are clear`
  - `Canonical refs and assumptions are filled in`
  - `Scope is framed with evidence`
- `research`
  - `Touched files are known`
  - `Dependency map and risks are filled in`
  - `VALIDATION.md is narrowed to milestone scope`
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
  - `Manual checks and residual risks were documented`
  - `Strict health gate is clean`
- `complete`
  - `Archive output was written`
  - `Carryforward was decided`
  - `Git closeout scope was made explicit`

## Operational Helpers

- `npm run workflow:hud`
- `npm run workflow:map-codebase`
- `npm run workflow:delegation-plan`
- `npm run workflow:new-milestone -- --id Mx --name "..." --goal "..."`
- `npm run workflow:complete-milestone -- --agents-review unchanged --summary "..." --stage-paths src/foo,tests/foo`
- `npm run workflow:save-memory -- --title "..." --note "..."`
- `npm run workflow:packet -- --step plan --json`
- `npm run workflow:next`
- `npm run workflow:pause-work -- --summary "..."`
- `npm run workflow:resume-work`
- `npm run workflow:plant-seed -- --title "..." --trigger "..."`
- `npm run workflow:switch-workstream -- --name "<slug>" --create`
- `npm run workflow:doctor`
- `npm run workflow:health -- --strict`
- `npm run workflow:forensics`

## Failure Playbook

- `Hash drift`
  - `workflow:packet -- --all --sync -> workflow:window -- --sync -> workflow:health -- --strict`
- `Active root mismatch`
  - `workflow:workstreams status -> workflow:switch-workstream or use --root to return to the correct root`
- `Resume ambiguity`
  - `Read HANDOFF.md + WINDOW.md -> workflow:resume-work -> workflow:next`
- `Dirty worktree closeout`
  - `Use explicit --stage-paths or --allow-workflow-only when it is truly docs-only`

## Working Rules

- `STATUS.md` is active-window only.
- `EXECPLAN.md` is the sole source of truth for the plan step.
- `DECISIONS.md` is only for durable cross-milestone decisions.
- `VALIDATION.md` is the canonical audit-contract source.
- `HANDOFF.md` is the session-level pause/resume snapshot.
- `WINDOW.md` is for active context budget and execution-cursor decisions.
- `SEEDS.md` must not be confused with `CARRYFORWARD.md`:
  - `CARRYFORWARD`: unfinished active work
  - `SEEDS`: ideas that may be planted later
- `WORKSTREAMS.md` records the active root; scripts consult it first when `--root` is not provided.
- `PREFERENCES.md` controls solo/team mode, discuss mode, and git isolation behavior.
- `Team Lite delegation` in `PREFERENCES.md` controls whether delegation is explicit-only, suggested, or off.
- If a named stream is required, move from generic `docs/workflow/*` to `docs/<workstream>/*`.
- `AGENTS.md` combined size defaults to `32 KiB`; split supporting context if it grows too large.
- Team Lite becomes active only when the user explicitly asks for parallel mode; worker write scopes must be disjoint before execute fan-out.
- Explicit Team Lite trigger phrases include:
  - `parallel yap`
  - `subagent kullan`
  - `delegate et`
  - `team mode`
- When Team Lite is active:
  - run `workflow:map-codebase`
  - run `workflow:delegation-plan -- --start --activation-text "<user request>"`
  - use `.workflow/orchestration/packets/` as child-task packets
  - ingest results with `workflow:delegation-plan -- --complete-task ...`
  - use `workflow:delegation-plan -- --status` to decide the next route

## Visibility Note

- The Codex app cannot guarantee skill-specific color or custom UI styling.
- Therefore, all commentary updates while this workflow skill is active should begin with the `WORKFLOW:` prefix.
- The prefix is required only while workflow is active, not in normal task flow.
- When possible, include the active step right after the prefix:
  - `WORKFLOW: discuss`
  - `WORKFLOW: research`
  - `WORKFLOW: plan`
  - `WORKFLOW: execute`
  - `WORKFLOW: audit`
  - `WORKFLOW: complete`
  - `WORKFLOW: handoff`

## Workflow Update Contract

- While workflow is active, each update should roughly follow:
  - `WORKFLOW: <step> | milestone=<id or NONE> | root=<path>`
- The first sentence should describe the current move and the next step.
- Stay at `1-2` sentences where possible; add a second sentence only when it adds value.
- If blocked, you may use `blocked` or `handoff` instead of the step:
  - `WORKFLOW: blocked | milestone=M3 | root=docs/yahoo-sync`
  - `WORKFLOW: handoff | milestone=M3 | root=docs/yahoo-sync`
- Before file edits, updates must begin with `WORKFLOW: execute`.
- Before audit/test work, updates must begin with `WORKFLOW: audit`.

## Update Templates

```text
WORKFLOW: discuss | milestone=M2 | root=docs/workflow
I am reading the active root and canonical files to tighten scope; next I will write evidence-backed assumptions into CONTEXT.md.
```

```text
WORKFLOW: research | milestone=M2 | root=docs/workflow
I am narrowing the touched files and verification surface; next I will reduce VALIDATION.md to milestone scope.
```

```text
WORKFLOW: execute | milestone=M2 | root=docs/workflow
I am applying the planned changes now; immediately after that I will re-check the workflow surface with doctor and health.
```

```text
WORKFLOW: audit | milestone=M2 | root=docs/workflow
I am running targeted checks and closing remaining risks; if the result is clean I will move into milestone closeout.
```

```text
WORKFLOW: handoff | milestone=M2 | root=docs/workflow
I am not starting a new step in this window; I am preparing HANDOFF.md and the workflow:resume-work command for resume.
```

## Golden Snapshot Rule

- Provider-level baselines: `tests/golden/providers/`
- Workflow/workstream baselines: `tests/golden/workflow/` or `tests/golden/<workstream>/`
- To diff snapshots:

```bash
node scripts/compare_golden_snapshots.ts <baseline> <candidate>
```

## Limits

- The skill does not store state; the canonical source of state is always the workflow files inside the repository.
- `.workflow/state.json` is a generated convenience surface only and must never replace the markdown control plane.
- `workflow:hud`, `workflow:doctor`, and `workflow:next` may all refresh that generated state surface.
- The skill is not a backlog document; it exists to stabilize active state and closeout discipline.

## Retro Surface

- `RETRO.md` is a process-quality surface, not the validation state.
- Trigger conditions:
  - `Every 5 completed milestones`
  - `When the same forensics root cause appears twice`
  - `When the user explicitly asks for workflow improvement`
- Retro loop:
  - `Collect archive, handoff, forensics, and user corrections`
  - `Evaluate the binary process-quality checks`
  - `Choose one process change`
  - `Apply it to skill/docs/scripts`
  - `Make a keep/discard decision after the next 1-2 real milestones`
