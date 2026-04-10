---
name: raiola-team-orchestration
description: Uses Team Lite and delegation planning for explicit parallel work. Use when the user asks for delegation, subagents, or bounded parallel execution with write-scope discipline.
---

# Raiola Team Orchestration

## Overview

This skill coordinates bounded parallel work without sacrificing reviewability or merge safety.

## When to Use

- The user explicitly asks for delegation, parallelism, or subagents
- Work can be split into disjoint scopes with clear ownership
- A main orchestrator must integrate several slices safely

## Workflow

1. Build the plan with `rai team` or `rai subagents`.
2. Declare ownership, write scope, and integration order before dispatch.
3. Keep same-wave write work disjoint.
4. Collect results, review patches, and integrate through the main lane.
5. Update the canonical docs after each wave.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "The workers can figure out overlap themselves." | Undefined ownership turns speed into merge debt. |
| "I don't need to update the docs until all workers finish." | The orchestrator's job is to keep state current as the wave evolves. |

## Red Flags

- Parallel workers edit overlapping files with no explicit ownership
- New workers are opened outside the planned chunk table
- Integration order is improvised instead of recorded

## Verification

- [ ] Every write-capable worker has explicit scope
- [ ] Results are collected and reviewed before merge
- [ ] Canonical docs were updated after integration
