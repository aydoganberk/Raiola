# PAGE BLUEPRINT

- Workflow root: `docs/workflow`
- Product surface: `Dashboard`
- Page type: `Dashboard`
- Why: Matched dashboard cues from the current goal plus control-plane archetype and dashboard alignment.
- Primary outcome: Support fast scanning, decisions, and safe next actions.

## Section Map

### Summary rail

- Goal: Expose the top metrics, risk, and next action immediately.
- Components: `hero metrics, status badges, primary CTA`
- States: `loading, partial-data, success`

### Filters and scoped controls

- Goal: Let users narrow data without losing orientation.
- Components: `search, segmented filters, date range, view toggles`
- States: `filtered-empty`

### Main data surface

- Goal: Support scanning, comparison, and prioritization.
- Components: `table, chart, empty state, error state`
- States: `loading, empty, filtered-empty, error, partial-data`

### Detail inspector

- Goal: Keep the selected record or panel visible without forcing hard navigation.
- Components: `side panel, metadata stack, secondary actions`
- States: `loading, success, destructive-confirmation, permissions`

### Activity or evidence lane

- Goal: Make timeline, logs, or recent changes easy to inspect in context.
- Components: `timeline, event list, status outputs`
- States: `loading, empty, error`

## Proof Surfaces

- Primary metrics should stay anchored, not move around between breakpoints.
- Operational trust comes from visible state handling more than decorative polish.

## Copy Goals

- Keep labels short, directive, and high-signal.
- Use helper text only where it reduces ambiguity or risk.

## Responsive Priorities

- Protect scan order on tablet and mobile before preserving every desktop column.
- Collapsed layouts should preserve summary rail, filters, and selected record context.

## Motion Moments

- Reserve motion for state change, selection, and live status.
- Use panel transitions to preserve context rather than announce animation.

## Anti-Patterns

- Do not replace relational data with decorative cards when comparison matters.
- Do not bury risk and action behind accordions or hidden secondary tabs.
- Do not replace data relationships with oversized decorative cards.
- Do not bury status, risk, or primary actions below fold-heavy hero chrome.
- Do not mix multiple visual metaphors on one screen.
- Do not hide core actions in tertiary menus when the task is frequent.

## Implementation Sequence

- Land Summary rail first so hierarchy and the primary outcome are visible immediately.
- Build Filters and scoped controls, Main data surface, Detail inspector next with shared primitives and explicit state hooks.
- Close with Activity or evidence lane and verify responsive behavior plus state coverage in the same pass.
