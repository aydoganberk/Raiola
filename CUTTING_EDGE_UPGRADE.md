# Cutting-Edge Upgrade Summary

Primary shell note: the current public CLI is `rai`, and the package/runtime brand is `raiola`.

## What was added

### 1) Advanced review mode
- `rai review-mode` is now a real, artifact-producing mode instead of a thin alias.
- Produces a unified review bundle with:
  - review lenses
  - top blockers
  - execution spine
  - review task graph waves
  - monorepo agent plan
  - Codex context pack
- Writes:
  - `.workflow/reports/review-mode.md`
  - `.workflow/reports/review-mode.json`

### 2) Stronger monorepo intelligence
- Workspace detection now reads:
  - `package.json` workspaces
  - `pnpm-workspace.yaml`
  - `lerna.json`
- Monorepo output now includes:
  - `workspaceDiscovery`
  - `performanceLevers`
  - `agentPlan` (`scout`, `fix`, `verify` waves)
- This improves large-repo routing, scoped writes, and targeted verification.

### 3) Richer frontend design intelligence
- UI direction now includes:
  - `experienceThesis`
  - `motionSystem`
  - `copyVoice`
  - `signatureMoments`
  - `screenBlueprints`
  - `differentiators`
  - `designSystemActions`
  - `implementationPrompts`
- UI spec and UI plan consume these fields so Codex can generate more tasteful, product-specific UI.

### 4) Command planning for Codex app + CLI
- Added `scripts/workflow/command_plan.js`.
- `rai do` now emits a `commandPlan` with:
  - primary command
  - secondary commands
  - CLI flow
  - Codex app flow
  - parallel flow
  - specialty flows

### 5) Expanded multilingual command understanding
- Added broader lexical support for more languages and scripts.
- Extended routing and deterministic capability matches for:
  - Greek
  - Thai
  - Hebrew
  - Persian
  - Polish
  - Ukrainian
  - Romanian
  - Czech
  - Swedish
  - Vietnamese
  - Indonesian

## Recommended commands
- `rai review-mode --goal "review the current diff"`
- `rai monorepo --json`
- `rai ui-direction --goal "premium minimal analytics dashboard" --json`
- `rai ui-plan --goal "premium minimal analytics dashboard"`
- `rai do --goal "design a premium frontend analytics dashboard with better taste" --json`

## Validation run
- `node --test tests/workflow_phase20.test.js tests/workflow_phase21.test.js`
- Result: 9 / 9 passing.
