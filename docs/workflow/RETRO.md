# RETRO

- Last updated: `2026-04-02`
- Retro status: `ready`
- Scope owner: `Codex + repo collaborators`
- Review cadence: `every_5_completed_milestones_or_repeated_process_failures`
- Trigger policy: `5_completed_milestones_or_2_similar_forensics_or_explicit_request`
- Current default profile: `standard`

## Purpose

- `RETRO.md` exists to evaluate workflow quality separately from product validation state.
- The question here is not "is the code correct?" but "did the workflow operate correctly?"
- Validation findings stay in `VALIDATION.md`; process frictions and improvement ideas live here.

## Binary Process Quality Checks

| Check | Question | Target | Status | Evidence | Notes |
| --- | --- | --- | --- | --- | --- |
| Explicit activation | Was workflow activated only when explicitly requested? | `yes` | `pending` | `AGENTS.md` | `Incorrect activation adds ritual overhead` |
| Root consistency | Did the active root match the files actually used? | `yes` | `pending` | `WORKSTREAMS.md` | `Mismatch creates handoff and packet drift` |
| Resume clarity | Can resume happen clearly in `<= 3` commands? | `yes` | `pending` | `HANDOFF.md` | `Ambiguous resume causes context loss` |
| Closeout hygiene | Was strict health clean before complete? | `yes` | `pending` | `VALIDATION.md` | `Otherwise stale closeout risk remains` |
| Update visibility | Were `WORKFLOW:`-prefixed updates visible during workflow? | `yes` | `pending` | `Installed workflow skill` | `Low visibility reduces clarity` |

## Open Frictions

- `No open process friction notes yet`

## Improvement Queue

- `No planned process improvements yet`

## Retro Loop

1. Collect evidence from `completed_milestones/`, `HANDOFF.md`, `forensics/`, and user corrections.
2. Evaluate the binary process-quality checks above as `yes/no`.
3. Choose one process change:
   - `skill wording`
   - `docs surface`
   - `script guardrail`
   - `failure playbook`
4. Apply the change and re-verify the surface with `doctor + health`.
5. Make a keep/discard decision after the next `1-2` real milestones.
6. Add the outcome to `Recent Retro Entries`.

## Recommended Triggers

- `Every 5 completed milestones`
- `When the same forensics root cause repeats twice`
- `When resume ambiguity`, `hash drift`, `active root mismatch`, or `dirty closeout` repeats
- `When the user explicitly asks to improve the workflow`

## Failure Signals

- `Hash drift` -> `raiola:packet -- --all --sync -> raiola:window -- --sync -> raiola:health -- --strict`
- `Active root mismatch` -> `raiola:workstreams status -> raiola:switch-workstream or use --root to return to the correct root`
- `Resume ambiguity` -> `Read HANDOFF.md + WINDOW.md -> raiola:resume-work -> raiola:next`
- `Dirty worktree closeout` -> `Use explicit --stage-paths or --allow-workflow-only when it is truly docs-only`

## Recent Retro Entries

- `No retro entries yet`
