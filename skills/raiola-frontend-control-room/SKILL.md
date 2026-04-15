---
name: raiola-frontend-control-room
description: "Frontend-control skill for keeping UI work evidence-backed, state-aware, and reuse-oriented."
---

# raiola-frontend-control-room

Use this skill when the job is **to move a frontend safely without losing browser proof, state coverage, or primitive discipline**.

## Focus

- inspect detected routes, component inventory, and UI system
- keep browser evidence, accessibility, and journey signals visible
- surface missing states, design debt, and repeated primitives before page-local fixes spread
- turn the result into a bounded frontend Codex goal when needed

## Expected moves

1. Run `rai frontend-control --json`.
2. Capture browser evidence if artifacts are missing.
3. Route into `rai state-atlas`, `rai ui-review`, `rai component-map`, or `rai responsive-matrix` based on the top signal.
4. Use `rai codex operator --goal "..." --json` when the next frontend wave should run in the native Codex layer.
