---
name: raiola-frontend-lane
description: Activates Raiola frontend specialization, UI direction, and browser-backed visual verification. Use when workflow is active and the task has explicit frontend, UI, design-system, or browser-verdict needs.
---

# Raiola Frontend Lane

## Overview

This skill keeps frontend work design-system-aware, state-complete, and visually verified instead of treating UI changes as isolated markup edits.
It must start by identifying the real product surface so Raiola does not mistake a mobile app for a landing page or a dashboard for a marketing site.

## When to Use

- Workflow is active and the task involves UI, screens, components, responsive behavior, or mobile screen flows
- Visual verdict matters alongside functional proof
- The repo has frontend signals such as TSX-heavy scope, Tailwind, Storybook, preview validation, or Flutter/mobile screen structure

## Workflow

1. Start with `rai map-frontend` and read the detected `product surface` before generating any frontend artifact.
   - If `Discuss mode` is `proposal_first`, offer 2-3 narrow frontend options and get approval before opening the heavier artifact path.
2. Default to the lean pack first:
   - `rai ui-direction`
   - `rai ui-spec`
3. Expand only when the task truly needs more planning depth:
   - `rai state-atlas` when state coverage is unclear or high-risk
   - `rai ui-plan` when sequencing/reuse is non-trivial
   - `rai frontend-brief` only when the user explicitly wants the full artifact pack
4. If the detected surface is mobile-first or Flutter-based, treat screen flow, gesture fidelity, device fit, and state continuity as first-class audit concerns.
5. Use the smallest artifact set that still makes the next edit safe; avoid generating the whole pack by reflex.
6. Treat the active visual verdict protocol as part of the audit contract.

## References

- `references/accessibility-checklist.md`

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "The logic changed more than the visuals, so browser proof is optional." | User-visible surfaces still need a visual verdict when UI behavior changes. |
| "I can improvise the look during implementation." | Raiola's frontend artifacts exist so taste and state coverage are explicit before the patch grows. |

## Red Flags

- UI code lands without state coverage
- The lane assumes landing-page or web-page structure before checking the detected product surface
- Flutter or mobile flows are pushed through browser-first review language
- Browser verification is skipped on visible behavior changes
- The design system is bypassed without a recorded reason

## Verification

- [ ] The detected product surface matches the real product
- [ ] Frontend direction artifacts are current enough for the slice
- [ ] The artifact set stayed lean unless the task explicitly needed the full pack
- [ ] Visual verdict evidence exists
- [ ] Accessibility smoke and responsive checks were considered
