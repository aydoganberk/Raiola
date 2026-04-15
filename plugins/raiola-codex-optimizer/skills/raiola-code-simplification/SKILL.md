---
name: raiola-code-simplification
description: Simplifies code while preserving exact behavior and keeping verification explicit. Use when a slice works but is harder to read, continue, or review than it needs to be.
---

# Raiola Code Simplification

## Overview

This skill creates a dedicated lane for behavior-preserving cleanup so simplification does not get mixed with feature drift.

## When to Use

- The code works, but the control flow or naming is heavier than needed
- Review findings point to clarity or maintainability issues
- You want a dedicated cleanup pass after feature work stabilizes

## Workflow

1. Start with `rai simplify --scope "..."`.
2. Understand the current behavior, callers, and verification surface first.
3. Simplify one concern at a time:
   - reduce nesting
   - extract clearer helpers
   - rename vague identifiers
   - remove dead branches only when proven safe
4. Re-run the relevant verification command after each slice.
5. Keep simplification separate from unrelated cleanup.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I'll clean this up while I add the feature." | Mixed intent makes regressions harder to spot and review. |
| "This abstraction might be useful later." | Future-proofing is not proof. Prefer the simplest code that serves the current slice. |

## Red Flags

- Simplification changes behavior without an updated verify story
- Cleanup sprawls into unrelated files
- Large rewrites happen without checkpoint-sized slices

## Verification

- [ ] The scope stayed behavior-preserving
- [ ] Relevant verification was re-run
- [ ] The resulting code is easier to review and continue
