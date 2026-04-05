# FRONTEND_PROFILE

- Last updated: `2026-04-05`
- Generator version: `phase5-frontend-v1`
- Workflow root: `docs/workflow`
- Scope: `workstream`
- Refresh policy: `incremental`
- Refresh status: `stale`
- Workflow active: `no`
- Frontend mode: `inactive`
- Frontend reason: `workflow_inactive`
- Selected adapters: `none`
- Visual verdict required: `no`
- Profile JSON: `.workflow/frontend-profile.json`
- Profile markdown: `docs/workflow/FRONTEND_PROFILE.md`

## Stack Fingerprint

- Primary framework: `Custom`
- Frameworks detected: `Custom`
- Styling detected: `custom`
- UI system: `custom`
- TSX/JSX files: `0`
- CSS-like files: `0`
- Forms stack: `none detected`
- Data stack: `none detected`
- Motion stack: `none detected`
- Test stack: `none detected`
- Storybook: `no`
- Playwright: `no`
- Figma links: `0`

## Fingerprint Inputs

- `docs/workflow/CONTEXT.md`
- `docs/workflow/MILESTONES.md`
- `docs/workflow/VALIDATION.md`
- `package.json`

## Styling

| Layer | Evidence |
| --- | --- |
| custom | none |

## UI System

| System | Evidence |
| --- | --- |
| custom | none |

## Activation Signals

| Signal | Evidence | Why it matters |
| --- | --- | --- |
| No active frontend signal | none | Frontend auto mode stays inactive |

## Adapter Registry

| Adapter | Status | Reason | Triggered |
| --- | --- | --- | --- |
| shadcn | not_applicable | Select when components.json appears | no |
| React best practices | not_applicable | Select when React/TSX editing becomes active | no |
| web-design-guidelines | available | Select when frontend mode activates | yes |
| Figma implement-design | not_applicable | Select when design implementation intent is present | no |
| browser verify | not_applicable | Select when preview/browser validation is needed | no |

## Visual Verdict Protocol

| Verdict area | Expectation | How to observe | Evidence expectation | Required |
| --- | --- | --- | --- | --- |
| responsive | Desktop and mobile layouts preserve hierarchy without overflow or broken spacing. | Check at least one narrow and one wide viewport or documented responsive breakpoint. | Screenshot pair or browser-verify note. | optional |
| interaction | Primary interactions, states, and form behavior feel complete and predictable. | Exercise key clicks, navigation, hover/focus, and any milestone-specific UI state changes. | Manual check note, test output, or browser-verify trace. | optional |
| visual consistency | Typography, spacing, color, and motion stay coherent with the chosen UI system. | Review changed screens/components against the active design direction or design system. | Review note plus screenshot evidence when relevant. | optional |
| component reuse | UI changes reuse the existing design system or shared component surfaces instead of fragmenting them. | Inspect changed components and note whether shared primitives/components were used. | Diff review note referencing reused component surfaces. | optional |
| accessibility smoke | Basic semantic structure, focusability, labels, and contrast concerns are checked at smoke-test level. | Review obvious keyboard/label/semantic issues or run lightweight a11y checks when available. | Manual smoke note or tool output. | optional |
| screenshot evidence | At least one screenshot or equivalent visual artifact backs up the UI verdict when frontend mode is active. | Capture or reference a screenshot artifact for the changed view when practical. | Screenshot path, URL, or explicit note explaining why none was needed. | optional |
