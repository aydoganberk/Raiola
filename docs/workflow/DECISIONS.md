# DECISIONS

This file records durable architecture and process decisions for the active stream in chronological order.

Rule:

- This file is not active-window state; it is only for durable, cross-milestone decisions.
- Temporary milestone-specific tradeoffs and implementation debates belong in `completed_milestones/`.

## 2026-04-01 - Default workflow surface is `docs/workflow/*`

- Decision:
  - Use `docs/workflow/EXECPLAN.md`, `docs/workflow/STATUS.md`, and `docs/workflow/DECISIONS.md` as the easy-to-find default surface for the repository.
- Why:
  - It gives every new session a stable entry point.
  - Overhead stays low when there is only one active stream.
  - The same structure can be copied into `docs/<workstream>/` when needed.
- Consequence:
  - If parallel streams appear, the generic folder may no longer be enough and a named root should be used.

## 2026-04-01 - Workflow is invoked through a repo-local skill

- Decision:
  - Keep this system available as a repo-local skill under `.agents/skills/raiola/`.
- Why:
  - It reduces the need to re-explain the workflow in future Codex sessions.
  - Together with `AGENTS.md`, the skill provides both durable rules and task-level workflow behavior.
- Consequence:
  - The skill text should stay concise; detailed state should always live in `docs/workflow/*` or `docs/<workstream>/*`.

## 2026-04-01 - Golden artifacts live under `tests/golden/`

- Decision:
  - Use `tests/golden/providers/` for provider-level baselines and `tests/golden/<workstream>/` for workstream-specific baselines.
- Why:
  - It separates provider fixtures from workstream regression baselines.
  - The testing surface stays close to runtime code.
- Consequence:
  - Baseline naming and update discipline should be reflected in `STATUS.md`.

## 2026-04-01 - Milestone tracking is separated into `MILESTONES.md`

- Decision:
  - Use `MILESTONES.md` for delivery-focused milestone tracking in addition to phases.
- Why:
  - Phases can be too broad; milestones are easier to track across sessions.
  - A "single active milestone" rule reduces scope drift.
- Consequence:
  - Each workflow surface now includes four main files: `EXECPLAN.md`, `STATUS.md`, `DECISIONS.md`, and `MILESTONES.md`.

## 2026-04-01 - Milestone lifecycle follows a mandatory loop

- Decision:
  - Every active milestone moves through `discuss -> research -> plan -> execute -> audit -> complete`.
- Why:
  - It frames scope early.
  - It forces research and file scanning before implementation.
  - It makes audit explicit and reduces "implemented but not verified" outcomes.
- Consequence:
  - `STATUS.md`, `EXECPLAN.md`, and `MILESTONES.md` all carry active milestone step information.
  - Planning for the next milestone does not begin before the current one is complete.

## 2026-04-01 - `CONTEXT.md` is the required memory layer between discuss and research

- Decision:
  - Add `CONTEXT.md` to every workflow root.
  - Create the first snapshot at the end of `discuss`.
  - Update the same file again at the end of `research`.
  - Allow `plan` only after the research-updated context exists.
- Why:
  - It prevents problem framing, assumptions, touched files, and risks from scattering across sessions.
  - It gives one fast reference point when context is lost.
- Consequence:
  - The default workflow surface expands to five key files: `EXECPLAN.md`, `STATUS.md`, `DECISIONS.md`, `MILESTONES.md`, and `CONTEXT.md`.

## 2026-04-01 - `CONTEXT.md` belongs only to the active milestone and completed detail is archived

- Decision:
  - Use `CONTEXT.md` only as the working memory for the active milestone.
  - Reset it at the start of every new milestone.
  - Store completed milestone detail under `completed_milestones/`.
- Why:
  - It keeps active context clean.
  - It prevents one milestone's framing from bleeding into the next.
  - It provides a milestone-based audit trail for backtracking.
- Consequence:
  - The workflow surface consists of active files plus the `completed_milestones/` archive.

## 2026-04-01 - The plan step source of truth is `Plan of Record` in `EXECPLAN.md`

- Decision:
  - The canonical, executable plan for the `plan` step lives in the `Plan of Record` section of `EXECPLAN.md`.
  - The plan checklist in `MILESTONES.md` remains only a short summary.
- Why:
  - One canonical plan location reduces confusion during execution.
  - The milestone card stays compact.
- Consequence:
  - The execute step follows `EXECPLAN.md`.

## 2026-04-01 - `CARRYFORWARD.md` is the active queue for unfinished work

- Decision:
  - Store unfinished items that must move into the next milestone in `CARRYFORWARD.md`.
  - Read it before planning the next milestone.
- Why:
  - It reduces work loss during milestone closeout.
  - It lets the next milestone plan feed directly from unresolved work.
- Consequence:
  - `CARRYFORWARD.md` stays active-window only; detailed history remains in archives.

## 2026-04-01 - `MEMORY.md` is the user-triggered durable memory surface

- Decision:
  - Update `MEMORY.md` only when the user explicitly asks to save memory or when active recall is needed for the current milestone.
  - Keep two layers: `Active Recall Items` and `Durable Notes`.
- Why:
  - It preserves "remember this later" information through context resets.
  - It separates milestone-local temporary notes from longer-lived preferences.
- Consequence:
  - `MEMORY.md` is read as active recall plus durable memory.

## 2026-04-01 - `save_memory` standardizes memory entry format

- Decision:
  - Use the `raiola:save-memory` helper for `MEMORY.md` entries.
- Why:
  - It keeps durable note formatting consistent.
  - It reduces manual edits.
- Consequence:
  - Memory entries are written in a stable date/title/note/tag/source format.

## 2026-04-01 - Plans are split into run-sized chunks

- Decision:
  - Each milestone plan should be written as `1-2` run-sized chunks that fit the context window.
- Why:
  - It prevents opening too much scope at once.
  - It keeps plans executable across sessions.
- Consequence:
  - `Plan of Record` in `EXECPLAN.md` includes current/next run chunk fields.

## 2026-04-01 - Complete milestone requires audit closeout before commit/push

- Decision:
  - Audit must be closed before a milestone is marked `complete`.
  - Commit and push protocol is the default follow-up after milestone completion.
  - Check whether `AGENTS.md` needs an update before complete.
- Why:
  - It makes milestone closeout explicit at version-control level, not only in docs.
  - It reduces information drift.
- Consequence:
  - `complete_milestone` supports git add/commit/push flow.
  - `AGENTS.md` combined size should still be monitored.

## 2026-04-01 - Active recall is automatically read within the same milestone

- Decision:
  - Split `MEMORY.md` into `Active Recall Items` and `Durable Notes`.
  - Automatically read active recall entries while the same milestone is still in progress.
- Why:
  - Temporary notes should not disappear when the context window changes.
  - Milestone-local notes should stay separate from durable preferences.
- Consequence:
  - `raiola:save-memory` defaults to `active` mode while a milestone is active.
  - Session startup automatically reads active recall entries.

## 2026-04-01 - Completing a milestone clears its active recall notes

- Decision:
  - `complete_milestone` removes active recall entries tied to the completed milestone from `MEMORY.md` and snapshots them into the archive.
- Why:
  - Temporary recall should not accumulate after the milestone is done.
  - Active memory stays clean without losing backtrackability.
- Consequence:
  - `MEMORY.md` remains a clean, active-window-style recall surface.
  - Historical recall notes remain visible in milestone archives.

## 2026-04-01 - Complete milestone requires explicit stage scope during git preflight

- Decision:
  - If the repo has changes outside workflow docs, `complete_milestone` does not auto-commit without explicit `--stage-paths` or deliberate `--allow-workflow-only`.
- Why:
  - It reduces accidental under-staging or over-staging in milestone commits.
  - It makes closeout safer inside a dirty worktree.
- Consequence:
  - Code-path selection during closeout becomes explicit.
  - `--allow-workflow-only` is a deliberate override for docs-only closeout.

## 2026-04-01 - The artifact set expands with `PROJECT`, `RUNTIME`, `PREFERENCES`, `VALIDATION`, `HANDOFF`, `SEEDS`, and `WORKSTREAMS`

- Decision:
  - The workflow surface is no longer only plan/status/decisions/milestones.
  - Add `PROJECT.md`, `RUNTIME.md`, `PREFERENCES.md`, `VALIDATION.md`, `HANDOFF.md`, `SEEDS.md`, and `WORKSTREAMS.md` to the artifact set.
- Why:
  - Splitting "why", "how", and "current state" into separate layers reduces AGENTS bloat and context drift.
- Consequence:
  - Session startup and helper scripts expand to read these files too.

## 2026-04-01 - Discuss mode is selected at the preference level

- Decision:
  - The `Discuss mode` field in `PREFERENCES.md` chooses between `assumptions`, `interview`, and `proposal_first`.
- Why:
  - Some codebases benefit from scanning first; some tasks benefit from clarifying the target first.
  - Frontend-heavy work sometimes needs a short approval gate before the packet deepens.
- Consequence:
  - `CONTEXT.md`, `MILESTONES.md`, and `raiola:next` explain discuss behavior based on this preference.
  - `proposal_first` stores the selected option and approval note in `CONTEXT.md` before the discuss packet expands.

## 2026-04-01 - `raiola:next` becomes the operational navigator for the active step

- Decision:
  - `raiola:next` produces one recommended next move based on the active milestone step.
- Why:
  - It answers "what should I do now?" quickly even as the workflow artifact set grows.
- Consequence:
  - It combines `STATUS.md`, `HANDOFF.md`, discuss mode, and recall state.

## 2026-04-01 - `HANDOFF.md` is the session-level snapshot layer for pause/resume

- Decision:
  - `HANDOFF.md` stores only session close/open state, not milestone history.
- Why:
  - Resume should stay lightweight and current.
- Consequence:
  - `raiola:pause-work` and `raiola:resume-work` revolve around this file.

## 2026-04-01 - `SEEDS.md` stays distinct from carryforward

- Decision:
  - Keep `SEEDS.md` separate from `CARRYFORWARD.md`.
- Why:
  - "Might be useful in a future milestone" is not the same as "unfinished and must continue".
- Consequence:
  - Seed intake stays visible separately during discuss/plan.

## 2026-04-01 - Named workstream root selection is recorded in `WORKSTREAMS.md`

- Decision:
  - Record the active workflow root in `WORKSTREAMS.md`, and let scripts consult it first when `--root` is not provided.
- Why:
  - It improves ergonomics between the generic `docs/workflow` root and named `docs/<workstream>` roots.
- Consequence:
  - `raiola:switch-workstream` takes responsibility for scaffolding named roots and switching active root.

## 2026-04-01 - `raiola:doctor` and `raiola:forensics` add an observability layer

- Decision:
  - Add `raiola:doctor` to check workflow state health and `raiola:forensics` to snapshot current state.
- Why:
  - The workflow needs fast sync checks and a durable debugging surface.
- Consequence:
  - Packet drift, validation gaps, and state inconsistencies can be diagnosed more reliably.
