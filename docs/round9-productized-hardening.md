# Round 9 Productized Hardening

This round closes the remaining productization gaps around the new control-plane layer so the repo behaves more like an engineering operating product than a collection of adjacent capabilities.

## What was hardened

### 1. Control-plane artifact persistence

Persisted control-plane JSON files now carry their own report/runtime artifact paths at write time.

That closes a consistency gap where downstream planes and export surfaces could see a report file but still miss the canonical path metadata needed to link it back into dashboards, GitHub outputs, or repo-status exports.

Affected surfaces include:

- Change Control
- Handoff OS
- Measurement / ROI
- Lifecycle Center
- Team Control Room
- Autopilot

### 2. Change Control as a true ship lane

`rai release-control` now materializes the supporting ship surfaces instead of only emitting its own gate.

The release lane now refreshes:

- Handoff OS
- Team Control Room
- Lifecycle Center
- Measurement / ROI
- Autopilot

This means the release plane can publish a richer repo-native status bundle without relying on stale or missing downstream artifacts.

### 3. Stable export self-references

The export bridge now plans and preserves stable self-referential paths for:

- `repo-status.json`
- `export-manifest.json`
- `github-actions-output.json`

That removes publish-plan coverage drift and makes the export set safer for CI, PR comment automation, and machine-readable consumers.

### 4. Canonical change-control reads

Consumers that previously preferred legacy `release-control.json` now prefer canonical `change-control.json` and fall back only when needed.

This reduces stale-state reads in packet, trust, and measurement flows.

### 5. Richer machine-readable release outputs

GitHub outputs and repo-status exports now carry the surrounding product surfaces more explicitly, including team-control and autopilot references alongside the existing trust, handoff, measurement, lifecycle, and operating-center links.

## Validation

Regression coverage added in `tests/workflow_phase38.test.js` verifies that:

- `rai release-control` materializes the supporting planes
- persisted control-plane JSON files include artifact/runtime paths
- export coverage reaches 100% for the expected publish set
- repo-status and export-manifest paths are self-consistent
- GitHub outputs include the linked supporting-plane artifacts

Broader compatibility was also rechecked against the existing phase 35–37 control-plane suites.
