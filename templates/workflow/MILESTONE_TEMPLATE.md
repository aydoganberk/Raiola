# MILESTONE_TEMPLATE

Use this template when opening a new milestone so the same lifecycle can be recreated consistently.

- Default usage: one user request = one milestone
- `discuss -> research -> plan -> execute -> audit -> complete` are steps inside the same milestone

## Packet Metadata Template

- Packet version: `2`
- Input hash: `pending_sync`
- Workflow profile: `standard`
- Budget profile: `normal`
- Target input tokens: `12000`
- Hard cap tokens: `20000`
- Reasoning profile: `deep`
- Confidence summary: `mixed_until_research`
- Refresh policy: `refresh_when_input_hash_drifts`

## Canonical Refs Template

| Class | Ref | Why |
| --- | --- | --- |
| source_of_truth | docs/workflow/CONTEXT.md | Active context |
| source_of_truth | docs/workflow/MILESTONES.md | Active milestone truth |
| source_of_truth | docs/workflow/PREFERENCES.md | Behavioral defaults |

## Upstream Refs Template

| Class | Ref | Why |
| --- | --- | --- |
| supporting | docs/workflow/EXECPLAN.md | Plan relationship |
| supporting | docs/workflow/VALIDATION.md | Audit relationship |
| supporting | docs/workflow/HANDOFF.md | Resume relationship |

## Unknowns Template

| Unknown | Impact | Owner | Status |
| --- | --- | --- | --- |
| `Unknown` | `Impact` | `owner` | `open` |

## Claim Ledger Template

| Claim | Type | Evidence refs | Confidence | Failure if wrong |
| --- | --- | --- | --- | --- |
| `Claim` | `source-backed` | `docs/workflow/...` | `Likely` | `Failure mode` |

## Table Row Template

| Milestone | Goal | Phase | Status | Step | Exit criteria | Evidence / notes |
| --- | --- | --- | --- | --- | --- | --- |
| `Mx` | `Name` | `Phase N` | `active` | `discuss` | `Goal` | `Packet seeded` |

## Validation Contract Template

| Deliverable | Verify command | Expected signal | Manual check | Golden | Audit owner | Status | Evidence | Packet hash |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `Deliverable` | `npm test` | `Clean result` | `UI or diff review` | `tests/golden/workflow/...` | `audit` | `pending` | `docs/workflow/STATUS.md` | `pending_sync` |

## Active Milestone Card Template

- Milestone: `Mx - Name`
- Phase: `Phase N`
- Status: `active`
- Step: `discuss`
- Goal:
  - `Goal`
- Success signal:
  - `What success looks like`
- Non-goals:
  - `What will not be done in this milestone`
- Workflow profile:
  - `standard`
- Discuss mode:
  - `assumptions`
- Clarifying questions / assumptions:
  - `Write assumptions or open questions here`
- Seed intake:
  - `Write relevant seeds here`
- Active recall intake:
  - `Write active recall intake here`
- Research target files:
  - `Fill after discuss`
- Plan checklist:
  - `Do not start plan before research-updated context exists`
- Execute notes:
  - `Use for execution notes`
- Audit checklist:
  - `Use for audit notes`
- Completion note:
  - `Archive, carryforward, and next milestone recommendation`
- Window note:
  - `Record any budget-specific note here`
- Falsifier:
  - `Write what could invalidate this milestone plan`

## Minimum Done Checklists

- `discuss`
  - `Goal/non-goals/success signal are clear`
  - `Canonical refs and assumptions are filled in`
  - `Scope is framed with evidence`
- `research`
  - `Touched files are known`
  - `Dependency map and risks are filled in`
  - `Validation contract is narrowed to milestone scope`
- `plan`
  - `Context is plan-ready`
  - `1-2` run chunks are written
  - `Audit plan and overhead fields are filled in`
- `execute`
  - `Only the active chunk was implemented`
  - `Status fields were updated`
  - `Off-plan drift was written back into docs`
- `audit`
  - `Verify commands were run`
  - `Manual checks and residual risks were recorded`
  - `Strict health gate is clean`
- `complete`
  - `Archive output was written`
  - `Carryforward was decided`
  - `Git closeout scope was made explicit`

## Failure Playbook

- `Hash drift`
  - `workflow:packet -- --all --sync -> workflow:window -- --sync -> workflow:health -- --strict`
- `Active root mismatch`
  - `workflow:workstreams status -> workflow:switch-workstream or use --root`
- `Resume ambiguity`
  - `Read HANDOFF.md + WINDOW.md -> workflow:resume-work -> workflow:next`
- `Dirty worktree closeout`
  - `Use explicit --stage-paths or --allow-workflow-only when appropriate`

## Lifecycle Reminder

- `discuss`
- `research`
- `plan`
- `execute`
- `audit`
- `complete`
