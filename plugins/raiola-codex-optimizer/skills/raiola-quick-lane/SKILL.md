---
name: raiola-quick-lane
description: Uses Raiola quick mode for narrow, short-lived tasks with visible artifacts and a clean escalation path. Use when the task is small but you still want inspectable context and closeout.
---

# Raiola Quick Lane

## Overview

Quick mode is the low-ritual lane for tasks that are too small for a full milestone but still benefit from visible context, plan, and verification notes.

## When to Use

- A narrow task should finish in roughly 15-60 minutes
- You want lightweight inspectability without opening the full milestone protocol
- The task may need escalation if it grows

## Workflow

1. Start with `rai quick start --goal "..."`.
2. Keep the quick context, plan, verify, and handoff files visible.
3. Close with `rai quick close --summary "..."` when done.
4. Escalate with `rai quick escalate` the moment the task needs real planning, broader scope, or multi-session continuity.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "This is too small to document at all." | Quick mode exists precisely for small tasks that still deserve visible context. |
| "I'll keep this in quick mode even though it grew." | Once planning or carryforward matters, escalate instead of stretching the lane. |

## Red Flags

- Multiple files and multiple risks accumulate with no escalation
- Quick notes stop reflecting the actual work
- The task starts to need wave planning or delegation

## Verification

- [ ] Quick context and verify notes exist
- [ ] Close or escalate happened explicitly
- [ ] Any unfinished work is visible for the next session
