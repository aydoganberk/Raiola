# CONTEXT

- Last updated: `2026-04-03`
- Workstream: `Default workflow control plane`
- Milestone: `NONE`
- Milestone profile override: `none`
- Step source: `discuss`
- Current step mode: `explicit`
- Step fulfillment state: `idle`
- Last control intent: `none`
- Context status: `idle_until_milestone`
- Discuss subphase: `intent_capture`
- Automation mode: `manual`
- Automation status: `idle`
- Plan readiness: `not_ready`
- Packet version: `5`
- Input hash: `d61184b21a5b9f447e89d32d37e0a039475806f6f7c0b97e8339c3bc75d4de30`
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

## Intent Core

- Goal: `Provide a clean starting surface for the first workflow milestone`
- Non-goals: `Starting workflow planning without an explicit user request`
- Explicit constraints: `Planning should not start until the constraint surface is explicit`
- Requirement IDs: `R0`
- Open requirements: `R0`
- Acceptance criteria IDs: `AC0`
- Critical decisions: `Workflow remains explicit opt-in`
- Current capability slice: `No active capability slice exists while the workflow is idle`

## Discuss Breakdown

- `Intent capture` -> `Turn the user request into a concrete intent statement and an initial requirement list`
- `Constraint extraction` -> `Surface explicit constraints, tradeoffs, and unanswered high-leverage questions`
- `Execution shaping` -> `Decide what a good strategy looks like before execution and validation planning begins`

## Discuss Proposal

- Status: `not_needed`
- Selected option: `none`
- Summary: `This discuss mode does not require a proposal approval gate.`
- Approval note: `Proceed with the normal discuss packet.`

## User Intent

- Primary request:
  - `Fill this when a milestone opens`
- Why this matters now:
  - `Capture the user-facing reason before planning starts`
- In-scope outcome:
  - `Describe the smallest meaningful capability we are trying to land`

## Explicit Constraints

| Constraint | Type | Source | Impact |
| --- | --- | --- | --- |
| `Fill when a milestone opens` | `scope` | `user` | `Planning should not start until the constraint surface is explicit` |

## Alternatives Considered

| Option | Status | Why |
| --- | --- | --- |
| `Fill when a milestone opens` | `open` | `Document the main alternatives before choosing a strategy` |

## Unanswered High-Leverage Questions

| Question | Impact | Owner | Status |
| --- | --- | --- | --- |
| `Fill when a milestone opens` | `Open questions can block a plan or change the preferred slice` | `owner` | `open` |

## Success Rubric

| Outcome | Observable signal | Why it matters |
| --- | --- | --- |
| `Fill when a milestone opens` | `Describe how we would observe success` | `A plan is only ready when success is observable` |

## Requirement List

| Requirement ID | Requirement | Type | Source | Notes |
| --- | --- | --- | --- | --- |
| `R0` | `Fill when a milestone opens` | `functional` | `user` | `Every active milestone should replace this placeholder with real requirements` |

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
