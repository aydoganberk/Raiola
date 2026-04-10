---
name: raiola-milestone-lifecycle
description: Runs the full Raiola milestone contract across discuss, research, plan, execute, audit, and complete. Use when workflow is explicitly active or when a resumable multi-step milestone is required.
---

# Raiola Milestone Lifecycle

## Overview

This skill is the full contract for explicit workflow work. It keeps multi-session execution resumable, reviewable, and bounded by canonical markdown.

## When to Use

- The user asked for workflow, milestone, handoff, or closeout discipline
- The work spans multiple sessions or multiple safe slices
- Canonical docs and evidence need to survive beyond the current chat window

## Workflow

1. Startup
   - Read `AGENTS.md`.
   - Resolve the active root from `WORKSTREAMS.md`.
   - Read the checkpoint-first surfaces before widening scope.
2. Discuss
   - Capture intent, constraints, unknowns, assumptions, and success rubric in `CONTEXT.md`.
3. Research
   - Record touched files, dependencies, risks, and verification surface.
   - Narrow `VALIDATION.md` to the milestone scope.
4. Plan
   - Treat `EXECPLAN.md` as the only canonical plan.
   - Write wave policy, chunk table, rollback/fallback, and commit policy.
   - Run `rai plan-check --sync --strict`.
5. Execute
   - Work one planned chunk at a time.
   - Keep the current wave explicit.
   - Leave checkpoints when the next chunk cannot be safely opened.
6. Audit
   - Run the declared verify commands and note manual checks and residual risk.
   - Update `STATUS.md` with the evidence story.
7. Complete
   - Archive milestone state, clear carryforward, and leave a human-readable closeout surface.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I remember the current state, so I don't need to update docs yet." | If the state matters, it belongs in the canonical docs before context shifts. |
| "I'll plan in my head and write EXECPLAN later." | Unwritten plans break resumability and make delegation unsafe. |
| "This later wave is obvious, so I can start it early." | Raiola's wave discipline exists to prevent hidden dependency drift. |

## Red Flags

- `STATUS.md` and `EXECPLAN.md` disagree on milestone or step
- Execute begins while `plan-check` still says `pending` or `fail`
- New work starts even though `WINDOW.md` says not to start the next step

## Verification

- [ ] `CONTEXT.md`, `EXECPLAN.md`, `STATUS.md`, and `VALIDATION.md` are current
- [ ] The active wave and chunk are explicit
- [ ] Verification evidence is written down
- [ ] A checkpoint or closeout note exists before pause
