# Round 10 Trust / Release / Continuity Convergence

This round focuses on product integrity rather than raw command count. The main goal is to make the repo-native control planes behave like one engineering operating product from trust to ship to handoff, instead of a loose set of adjacent capabilities.

## What changed

### 1. Change Control now publishes a machine-readable control-plane packet

`rai release-control` and `rai control-plane-publish` now emit `.workflow/exports/control-plane-packet.json`.

That packet gathers the load-bearing release surfaces into one exportable object:

- repo-config summary
- trust decisions
- release verdict and blockers
- continuity / resume state
- explainability tier and lane
- measurement signals
- automation and team-ops state
- lifecycle drift
- publish/export metadata

This turns the release lane into a better integration surface for CI, dashboards, downstream automation, and external systems.

### 2. Release Control now converges instead of only materializing once

`rai release-control` now materializes Explainability, Handoff OS, Measurement / ROI, Lifecycle Center, Team Control Room, and Autopilot, then re-publishes until the linked continuity/export surface stabilizes.

That matters because Handoff OS now depends on information that is only fully available after publish outputs exist, such as:

- continuity bundle path
- repo-status path
- export-manifest path
- control-plane packet path

The release lane now behaves more like a control-plane convergence pass than a one-shot report emitter.

### 3. Handoff OS now carries decision basis, not just recap text

`rai handoff` still emits compact handoff, PR brief, session report, and the continuity bundle, but it now also stores:

- trust verdict and decisions
- change-control gate state
- explainability tier / lane
- linked control-plane summaries
- external resume links for repo status, export manifest, and control-plane packet

That closes one of the most important product-integrity gaps: another operator no longer needs to reconstruct why the current lane is safe or unsafe from scratch.

### 4. Measurement now exposes control-plane integrity

`rai measure` now reports whether the control-plane packet exists and whether explainability is visible in the current repo-native operating surface.

That helps the product prove not just that work was done, but that the productized operating surface is intact.

## Validation

Regression coverage in `tests/workflow_phase39.test.js` verifies that:

- Explainability is materialized by `rai release-control`
- Change Control exports `control-plane-packet.json`
- Export manifest, repo status, CI gate, and GitHub outputs all reference the same packet path
- Handoff OS and `continuity-bundle.json` link back to trust / release / explainability decision basis and external resume surfaces
- Measurement reflects control-plane packet and explainability visibility

This round keeps pushing Raiola away from “many capable commands” and toward “a few coherent product planes that stay linked all the way to ship and resume.”
