---
name: using-raiola
description: Discovers and activates the right Raiola workflow skill without auto-starting workflow. Use when starting a session, deciding whether workflow is warranted, or choosing the right lifecycle command.
---

# Using Raiola

## Overview

Raiola is a workflow OS, not a default for every request. This meta-skill helps decide when to stay lightweight, when to use the lifecycle facade, and when to open the full workflow contract.

## When to Use

- Starting a new session in a repo that ships Raiola
- The task sounds multi-step, resumable, review-heavy, or parallel
- You need to choose between quick mode, full milestones, frontend, monorepo, or review lanes

Do not use Raiola just because it is available. Normal coding tasks should stay normal unless explicit workflow discipline is valuable.

## Discovery Flow

```text
Task arrives
    |
    |-- User explicitly wants workflow / handoff / milestone / closeout?
    |      -> raiola-milestone-lifecycle
    |
    |-- Narrow 15-60 minute task with low ritual?
    |      -> raiola-quick-lane
    |
    |-- Review / PR / blocker triage / readiness work?
    |      -> raiola-review-closeout
    |
    |-- Parallelism / delegation / bounded workers?
    |      -> raiola-team-orchestration
    |
    |-- Frontend / UI / browser-verdict work while workflow is active?
    |      -> raiola-frontend-lane
    |
    |-- Large monorepo staged analysis?
    |      -> raiola-monorepo-mode
    |
    |-- Behavior-preserving cleanup?
    |      -> raiola-code-simplification
    |
    |-- Otherwise
           -> stay lightweight and use rai spec/plan/build/test/simplify/review/ship as needed
```

## Core Operating Rules

1. Workflow is explicit opt-in.
2. The lifecycle facade is the preferred first layer:
   - `rai spec`
   - `rai plan`
   - `rai build`
   - `rai test`
   - `rai simplify`
   - `rai review`
   - `rai ship`
3. Once workflow is active, markdown is canonical and runtime JSON is derived.
4. Verification must be stored or described explicitly. "Seems right" is not enough.
5. Delegation requires explicit ownership and disjoint write scope.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "Raiola is installed, so every task should use workflow." | Workflow overhead is only worth paying when continuity, reviewability, or orchestration matter. |
| "I can skip the lifecycle facade and jump straight into edits." | The facade exists to make the correct lane and evidence surface obvious before you drift. |
| "The state is obvious from chat history." | Raiola exists because chat history is not a durable control plane. |

## Red Flags

- Opening a milestone for a trivial one-file tweak
- Delegating work before write scopes are declared
- Treating `.workflow/state.json` as canonical
- Skipping verification because the diff "looks small"

## Verification

- [ ] Chosen lane matches the actual task
- [ ] Workflow stays explicit opt-in
- [ ] The right lifecycle command or targeted skill was selected
- [ ] Verification expectations are visible before execution starts
