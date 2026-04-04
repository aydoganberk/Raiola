# WINDOW

- Last updated: `2026-04-01`
- Session id: `pending_sync`
- Current packet hash: `pending_sync`
- Window mode: `estimated`
- Estimated used tokens: `0`
- Estimated remaining tokens: `128000`
- Window size tokens: `128000`
- Reserve floor: `16000`
- Current step: `complete`
- Current run chunk: `NONE`
- Can finish current chunk: `yes`
- Can start next chunk: `yes`
- Recommended action: `continue`
- Automation recommendation: `continue_in_current_window`
- Resume anchor: `Milestone open`
- Last safe checkpoint: `pending_sync`
- Checkpoint freshness: `no`
- Packet loading mode: `delta`
- Token efficiency measures: `auto`
- Core packet size: `0`
- Loaded packet size: `0`
- Unchanged refs omitted: `0`
- Cold refs omitted: `0`
- Budget status: `ok`

## Current Packet Summary

- `Packet version: 5`
- `Primary doc: idle_starter_state`
- `Packet hash: pending_sync`
- `Packet loading mode: delta`
- `Token efficiency measures: auto`
- `Core packet size: 0`
- `Loaded packet size: 0`
- `Active read size: 0`
- `Unchanged refs omitted: 0`
- `Cold refs omitted: 0`
- `Estimated packet tokens: 0`
- `Packet budget status: ok`

## Read Set Estimate

- `docs/workflow/EXECPLAN.md`
- `docs/workflow/PREFERENCES.md`
- `docs/workflow/STATUS.md`
- `docs/workflow/WINDOW.md`
- `scripts/workflow/doctor.js`
- `scripts/workflow/health.js`

## Packet Tier Summary

- `Tier A: docs/workflow/HANDOFF.md#Continuity Checkpoint; docs/workflow/CONTEXT.md#Intent Core; docs/workflow/EXECPLAN.md#Delivery Core; docs/workflow/EXECPLAN.md#Open Requirements; docs/workflow/EXECPLAN.md#Current Capability Slice; docs/workflow/STATUS.md#Workflow Cursor; docs/workflow/VALIDATION.md#Validation Core`
- `Tier A omitted unchanged: None`
- `Tier B: docs/workflow/CONTEXT.md#User Intent; docs/workflow/CONTEXT.md#Explicit Constraints; docs/workflow/CONTEXT.md#Requirement List; docs/workflow/CONTEXT.md#Success Rubric`
- `Tier B omitted unchanged: None`
- `Tier C loaded: None`
- `Tier C omitted: docs/workflow/PROJECT.md; docs/workflow/WORKSTREAMS.md; docs/workflow/PREFERENCES.md; docs/workflow/EXECPLAN.md; docs/workflow/VALIDATION.md; docs/workflow/HANDOFF.md`

## Artifact Estimate

- `Workflow artifact tokens: 0`
- `Execution overhead: 2000`
- `Verify overhead: 1000`

## Recent Context Growth

- `Delta since last window snapshot: 0`
- `Budget ratio: 0.00`

## Checkpoint Guard

- `Checkpoint freshness: no`
- `Reason: No continuity checkpoint is recorded for the current packet`
- `Checkpoint required before compaction: no`
- `Recommended action: continue`

## Notes

- `When Window budget mode is native, this file can be filled from bridge data`
- `When automation mode is active, handoff/new-window recovery is preferred before packet compaction when the client can support it`
