# DESIGN DEBT

- Debt count: `6`

## Items

- [medium] `component preview` Storybook surface is missing, so component-level visual regression review depends on ad hoc previews.
- [medium] `browser automation` Playwright is not detected, so visual verification stays smoke-level by default.
- [low] `design contract` No Figma or external design reference was linked into the workflow surface.
- [high] `missing states` State coverage is incomplete for: loading, empty, error, success, disabled, interaction, form-validation, mobile-nav.
- [medium] `a11y` No browser evidence is available to validate accessibility expectations.
- [medium] `journey coverage` User-journey evidence is still incomplete.
