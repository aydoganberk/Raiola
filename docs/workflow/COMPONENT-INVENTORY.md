# COMPONENT INVENTORY

- Framework: `Custom`
- UI system: `custom`

## Components

- `package` -> tests/fixtures/large-monorepo/packages/ui/package.json (shared)
- `Card` -> tests/fixtures/large-monorepo/packages/ui/src/Card.tsx (shared)
- `Table` -> tests/fixtures/large-monorepo/packages/ui/src/Table.tsx (shared)
- `package` -> tests/fixtures/medium-monorepo/packages/ui/package.json (shared)
- `Button` -> tests/fixtures/medium-monorepo/packages/ui/src/Button.tsx (shared)

## Primitive Opportunities

- `Clarify relational data surfaces` -> Model relational data with real table semantics first, then apply visual wrappers or advanced behaviors second. (Prefer real <table>/<thead>/<tbody> semantics before composing custom grid chrome.)
