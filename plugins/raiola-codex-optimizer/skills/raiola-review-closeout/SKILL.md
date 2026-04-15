---
name: raiola-review-closeout
description: Runs Raiola review, verification, and ship-ready closeout surfaces. Use when the task is about code review, blocker triage, readiness, PR packaging, or ship discipline.
---

# Raiola Review And Closeout

## Overview

This skill turns a diff or milestone into a reusable review and ship story with explicit blockers, verification evidence, and residual risk.

## When to Use

- Reviewing a change, PR, or milestone
- Re-checking a risky slice after fixes
- Preparing a human-readable closeout package

## Workflow

1. Start with `rai review`.
2. Escalate to `rai review-mode` or `rai pr-review` when the surface is deeper than a single pass.
3. Run `rai verify-work` if the evidence story is still incomplete.
4. Use `rai ship-readiness` before calling a slice safe to ship.
5. Finish with `rai ship`, `rai pr-brief`, or `rai release-notes` when handoff quality matters.

## References

- `references/testing-checklist.md`
- `references/security-checklist.md`
- `references/ship-readiness-checklist.md`

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "The diff is small, so review can stay informal." | Small diffs still ship regressions when evidence and residual risk stay implicit. |
| "I already know what's left, so ship-readiness is overkill." | Closeout quality is about what the next reviewer or operator can trust, not what you remember. |

## Red Flags

- Findings are not tied to files or evidence
- Residual risks are omitted because they feel "minor"
- Ship output cannot be understood without replaying the session

## Verification

- [ ] Review findings are blocker-first and evidence-backed
- [ ] Verification coverage is explicit
- [ ] Ship or closeout notes include residual risk and rollback context
