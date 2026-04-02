# CONTEXT

- Last updated: `2026-04-02`
- Workstream: `Default workflow control plane`
- Milestone: `NONE`
- Step source: `discuss`
- Context status: `idle_until_milestone`
- Plan readiness: `not_ready`
- Packet version: `2`
- Input hash: `pending_sync`
- Budget profile: `normal`
- Target input tokens: `12000`
- Hard cap tokens: `20000`
- Reasoning profile: `balanced`
- Confidence summary: `mixed_idle_surface`
- Refresh policy: `refresh_when_input_hash_drifts`
- Reset policy: `Rewrite from scratch at the start of each new milestone`
- Archive policy: `Move completed milestone detail into completed_milestones/`
- Discuss mode: `assumptions`

## Canonical Refs

| Class | Ref | Why |
| --- | --- | --- |
| source_of_truth | docs/workflow/PROJECT.md | Workflow purpose and operating model |
| source_of_truth | docs/workflow/WORKSTREAMS.md | Active root registry |
| source_of_truth | docs/workflow/PREFERENCES.md | Discuss and budget defaults |

## Upstream Refs

| Class | Ref | Why |
| --- | --- | --- |
| supporting | docs/workflow/EXECPLAN.md | Plan source-of-truth relationship |
| supporting | docs/workflow/VALIDATION.md | Audit contract dependency |
| supporting | docs/workflow/HANDOFF.md | Resume surface dependency |

## Problem Frame

- Goal:
  - `Provide a clean starting surface for the first workflow milestone`
- Success signal:
  - `When the first milestone is explicitly defined, this file can be filled for that scope`
- Non-goals:
  - `Starting workflow planning without an explicit user request`

## Codebase Scan Summary

- `The starter scaffold remains idle until an active milestone opens`
- `The completed milestone archive starts empty`
- `Packet and validation fields will be synchronized when the first milestone begins`

## Clarifying Questions / Assumptions

| Claim | Confidence | Evidence refs | Failure mode |
| --- | --- | --- | --- |
| `Workflow expects explicit activation by default` | `Confident` | `docs/workflow/PREFERENCES.md; docs/workflow/PROJECT.md` | `Workflow may activate when it should not` |
| `A single user request can usually be modeled as one milestone` | `Likely` | `docs/workflow/MILESTONES.md; docs/workflow/RUNTIME.md` | `Milestone granularity becomes inconsistent` |

## Claim Ledger

| Claim | Type | Evidence refs | Confidence | Failure if wrong |
| --- | --- | --- | --- | --- |
| `The workflow surface is designed as explicit opt-in` | `source-backed` | `docs/workflow/PREFERENCES.md; docs/workflow/PROJECT.md` | `Confident` | `Agents may activate workflow unnecessarily` |
| `The current root has enough canonical files to start from an idle state` | `source-backed` | `docs/workflow/WORKSTREAMS.md; docs/workflow/EXECPLAN.md; docs/workflow/VALIDATION.md` | `Likely` | `A new milestone may open with an incomplete packet` |

## Unknowns

| Unknown | Impact | Owner | Status |
| --- | --- | --- | --- |
| `When the first active milestone will be opened` | `Packet contents will change with milestone scope` | `user` | `open` |

## Research Targets

- `Fill this when the user opens a milestone`

## Carryforward Intake

- `No carryforward items yet`

## Seed Intake

- `No open seeds yet`

## Active Recall Intake

- `There are no active recall notes because no milestone is active`

## Touched Files

- `Fill this when a workflow milestone opens`

## Dependency Map

- `WORKSTREAMS.md` -> active root selection
- `PREFERENCES.md` -> discuss mode, git isolation, and activation defaults
- `EXECPLAN.md` -> Plan of Record
- `VALIDATION.md` -> audit contract
- `HANDOFF.md` -> pause/resume snapshot
- `WINDOW.md` -> budget/orchestrator snapshot

## Risks

- `No active milestone exists yet`

## Verification Surface

- `node scripts/workflow/doctor.js`
- `node scripts/workflow/health.js --strict`
- `node scripts/workflow/next_step.js --json`

## What Would Falsify This Plan?

- `If workflow is not actually explicit_only, the current problem frame is wrong`
- `If WORKSTREAMS.md points to another active root, this packet is stale`

## Ready For Plan

- `No`
