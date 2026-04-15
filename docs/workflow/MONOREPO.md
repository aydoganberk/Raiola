# MONOREPO INTELLIGENCE

- Generated at: `2026-04-13T11:28:17.080Z`
- Repo shape: `single-package`
- Package count: `1`
- Changed packages: `none`
- Impacted packages: `none`
- Impacted tests: `0`
- Package manager: `npm`

## Workspace Discovery

- `No workspace metadata source was detected beyond the root package.`

## Recommended Write Shards

- `No package-local write shard suggestion available.`

## Review Shards

- `No review shard suggestion available.`

## Hotspots

- `raiola` score=0 → 6 package test targets (read first: `., tests/release_automation.test.js, tests/workflow_phase1.test.js, tests/workflow_phase10.test.js, tests/workflow_phase11.test.js`)

## Context Slices

### raiola hotspot

- 6 package test targets
- Read first: `., tests/release_automation.test.js, tests/workflow_phase1.test.js, tests/workflow_phase10.test.js, tests/workflow_phase11.test.js`
- Verify first: `npm run test`

### Verification spine

- Use package-local verification before escalating to the whole monorepo.
- Read first: `., tests/release_automation.test.js, tests/workflow_phase1.test.js, tests/workflow_phase10.test.js`
- Verify first: `npm run test`

## Targeted Verify

### raiola

- `npm run test`

### Root smoke

- `npm run test`

## Context Budgets

### compact

- Fastest useful context for Codex on a wide repo.
- Read first: `., tests/release_automation.test.js, tests/workflow_phase1.test.js, tests/workflow_phase10.test.js, tests/workflow_phase11.test.js`
- Verify first: `npm run test`

### balanced

- Default operating preset for package-scoped execution and review.
- Read first: `., tests/release_automation.test.js, tests/workflow_phase1.test.js, tests/workflow_phase10.test.js, tests/workflow_phase11.test.js`
- Verify first: `npm run test`

### deep

- Use only when package-local context is insufficient or the fan-out is unusually high.
- Read first: `., tests/release_automation.test.js, tests/workflow_phase1.test.js, tests/workflow_phase10.test.js, tests/workflow_phase11.test.js`
- Verify first: `npm run test`

## Agent Plan

### scout-1

- Mode: `readonly`
- Focus: `raiola`
- Read first: `., tests/release_automation.test.js, tests/workflow_phase1.test.js, tests/workflow_phase10.test.js, tests/workflow_phase11.test.js`
- Outcome: Map regression risk, dependency fan-out, and missing verification evidence before writes start.

- `No bounded write wave was inferred.`

### verify--

- Mode: `targeted_verify`
- Focus: `raiola`
- Verify: `npm run test`
- Outcome: Confirm package-local safety before root-level smoke runs.

### verify-root-smoke

- Mode: `targeted_verify`
- Focus: `root smoke`
- Verify: `npm run test`
- Outcome: Run only after package-local lanes settle.

## Performance Levers

- Hotspots expose the highest-value read-first surfaces: raiola.
- Use per-package verify commands before root smoke checks to keep feedback fast on large monorepos.

## Performance Notes

- The root package is heavy; keep Codex context windows focused on a workspace path whenever possible.
