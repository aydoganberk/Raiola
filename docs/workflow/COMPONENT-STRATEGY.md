# COMPONENT STRATEGY

- Workflow root: `docs/workflow`
- Framework: `Custom`
- UI system: `custom`
- Page type: `Dashboard`
- Product category: `Analytics Platform`
- Inventory: `5` components (5 shared / 0 local)

## Reuse Now

### Table

- File: `tests/fixtures/large-monorepo/packages/ui/src/Table.tsx`
- Section: Main data surface
- Why: Table already overlaps main data surface and should be reused before adding page-local UI.

## Extract Now

### Clarify relational data surfaces

- Source: `tests/fixtures/large-monorepo/packages/ui/src/Table.tsx`
- Why: Model relational data with real table semantics first, then apply visual wrappers or advanced behaviors second.
- Move: Prefer real <table>/<thead>/<tbody> semantics before composing custom grid chrome.

## Build Now

### Build Summary rail

- Target: hero/proof section shell
- Why: No existing component strongly matches summary rail, so this section needs a fresh shared shell.
- States: `loading, partial-data, success`

### Build Filters and scoped controls

- Target: filter/search control bar
- Why: No existing component strongly matches filters and scoped controls, so this section needs a fresh shared shell.
- States: `filtered-empty`

### Build Detail inspector

- Target: detail panel or dialog primitive
- Why: No existing component strongly matches detail inspector, so this section needs a fresh shared shell.
- States: `loading, success, destructive-confirmation, permissions`

### Build Activity or evidence lane

- Target: timeline or stepper block
- Why: No existing component strongly matches activity or evidence lane, so this section needs a fresh shared shell.
- States: `loading, empty, error`

### Build the shared async-state family

- Target: loading / empty / error / success primitives
- Why: Required state evidence is still missing for loading, empty, filtered-empty, error, success, destructive-confirmation.
- States: `loading, empty, interaction, error, success`

## Section Coverage

### Summary rail

- `package` -> tests/fixtures/large-monorepo/packages/ui/package.json (shared, score 1)
- `Card` -> tests/fixtures/large-monorepo/packages/ui/src/Card.tsx (shared, score 1)
- `Table` -> tests/fixtures/large-monorepo/packages/ui/src/Table.tsx (shared, score 1)
- `package` -> tests/fixtures/medium-monorepo/packages/ui/package.json (shared, score 1)

### Filters and scoped controls

- `package` -> tests/fixtures/large-monorepo/packages/ui/package.json (shared, score 1)
- `Card` -> tests/fixtures/large-monorepo/packages/ui/src/Card.tsx (shared, score 1)
- `Table` -> tests/fixtures/large-monorepo/packages/ui/src/Table.tsx (shared, score 1)
- `package` -> tests/fixtures/medium-monorepo/packages/ui/package.json (shared, score 1)

### Main data surface

- `Table` -> tests/fixtures/large-monorepo/packages/ui/src/Table.tsx (shared, score 3)
- `package` -> tests/fixtures/large-monorepo/packages/ui/package.json (shared, score 1)
- `Card` -> tests/fixtures/large-monorepo/packages/ui/src/Card.tsx (shared, score 1)
- `package` -> tests/fixtures/medium-monorepo/packages/ui/package.json (shared, score 1)

### Detail inspector

- `package` -> tests/fixtures/large-monorepo/packages/ui/package.json (shared, score 1)
- `Card` -> tests/fixtures/large-monorepo/packages/ui/src/Card.tsx (shared, score 1)
- `Table` -> tests/fixtures/large-monorepo/packages/ui/src/Table.tsx (shared, score 1)
- `package` -> tests/fixtures/medium-monorepo/packages/ui/package.json (shared, score 1)

### Activity or evidence lane

- `package` -> tests/fixtures/large-monorepo/packages/ui/package.json (shared, score 1)
- `Card` -> tests/fixtures/large-monorepo/packages/ui/src/Card.tsx (shared, score 1)
- `Table` -> tests/fixtures/large-monorepo/packages/ui/src/Table.tsx (shared, score 1)
- `package` -> tests/fixtures/medium-monorepo/packages/ui/package.json (shared, score 1)

## Component Policy

- Favor the active custom stack before introducing a second component vocabulary.
- Keep dashboard sections as shells that compose shared primitives instead of hard-coding all behavior into one page file.
- Use analytics platform expectations as the tie-breaker when deciding between dense utility and decorative marketing polish.
- Extract repeated page-local blocks as named primitives as soon as a second section or screen needs them.
- Land shared state primitives in the same pass as section scaffolds so new screens inherit resilience by default.

## Risks

- State evidence is still missing for loading, empty, error, success, disabled, interaction, form-validation, mobile-nav, so implementation could drift toward happy-path-only UI.
- Styling conventions are not strongly signaled yet, so component extraction should set token and naming rules early.
