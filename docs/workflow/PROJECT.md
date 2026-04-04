# PROJECT

- Last updated: `2026-04-02`
- Scope owner: `Codex + repo collaborators`
- Current workstream: `Default workflow control plane`
- Project status: `ready`

## Purpose

- This folder is the canonical surface for the repository's long-lived Codex workflow protocol.
- Its goal is to reduce context loss in multi-session work, measure packet budget, and reduce unsupported-claim risk.
- This surface is not the default path; it is opt-in and becomes active only when the user explicitly wants workflow discipline.

## Primary Outcomes

- Keep the `discuss -> research -> plan -> execute -> audit -> complete` loop consistent.
- Treat `WORKSTREAMS -> CONTEXT packet -> EXECPLAN -> VALIDATION -> COMPLETE` as the workflow source of truth chain.
- Separate active-window files from archive files.
- Keep memory, carryforward, handoff, window, and validation as distinct layers.
- Support `lite | standard | full` workflow profiles.
- Maintain a process-quality improvement surface through `RETRO.md`.
- Make git scope and reasoning quality safer during milestone closeout.

## Non-Goals

- Storing the application feature backlog here
- Documenting runtime architecture in depth here
- Turning this file into a completed milestone changelog

## Stable Rules

- `AGENTS.md` stores behavior and scope rules
- `PROJECT.md` explains why the workflow exists and what it optimizes for
- `RUNTIME.md` stores operational commands and repo-level runtime notes
- `DECISIONS.md` stores durable architecture and process decisions
- `STATUS.md` is the active-window view
- `WINDOW.md` stores the active context-budget snapshot
- Workflow activation begins only with explicit user opt-in
- Default milestone granularity is one request = one milestone, with lifecycle steps as substeps

## Success Criteria

- A new session can resume the active milestone by reading workflow files only
- Milestone closeout keeps active recall, carryforward, archive, packet hash, and git closeout in sync
- A new `docs/<workstream>/` surface can be opened easily when stream isolation is needed
- The strict health gate can surface packet drift, validation gaps, and hallucination risk
- Process quality can be evaluated in `RETRO.md` independently from product validation state
