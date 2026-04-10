---
name: raiola-frontend-lane
description: Activates Raiola frontend specialization, UI direction, and browser-backed visual verification. Use when workflow is active and the task has explicit frontend, UI, design-system, or browser-verdict needs.
---

# Raiola Frontend Lane

## Overview

This skill keeps frontend work design-system-aware, state-complete, and visually verified instead of treating UI changes as isolated markup edits.

## When to Use

- Workflow is active and the task involves UI, screens, components, or responsive behavior
- Visual verdict matters alongside functional proof
- The repo has frontend signals such as TSX-heavy scope, Tailwind, Storybook, or preview validation

## Workflow

1. Map the frontend surface with `rai map-frontend` when needed.
2. Generate or refresh the direction artifacts:
   - `rai ui-direction`
   - `rai design-dna`
   - `rai state-atlas`
   - `rai ui-spec`
   - `rai ui-plan`
3. Use the design artifacts as the tie-breaker before patching UI code.
4. Treat responsive, interaction, accessibility smoke, and screenshot evidence as part of the audit contract.

## References

- `references/accessibility-checklist.md`

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "The logic changed more than the visuals, so browser proof is optional." | User-visible surfaces still need a visual verdict when UI behavior changes. |
| "I can improvise the look during implementation." | Raiola's frontend artifacts exist so taste and state coverage are explicit before the patch grows. |

## Red Flags

- UI code lands without state coverage
- Browser verification is skipped on visible behavior changes
- The design system is bypassed without a recorded reason

## Verification

- [ ] Frontend direction artifacts are current enough for the slice
- [ ] Visual verdict evidence exists
- [ ] Accessibility smoke and responsive checks were considered
