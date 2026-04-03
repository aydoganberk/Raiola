# VALIDATION

- Last updated: `2026-04-03`
- Active milestone: `NONE`
- Validation status: `idle_until_milestone`
- Audit readiness: `not_ready`
- Contract owner: `audit`
- Packet version: `3`
- Input hash: `pending_sync`
- Budget profile: `normal`
- Target input tokens: `9000`
- Hard cap tokens: `17000`
- Reasoning profile: `deep`
- Confidence summary: `idle_surface_waiting_for_contract`
- Refresh policy: `refresh_when_plan_hash_drifts`

## Canonical Refs

| Class | Ref | Why |
| --- | --- | --- |
| source_of_truth | docs/workflow/EXECPLAN.md | Plan / audit dependency |
| source_of_truth | docs/workflow/STATUS.md | Audit outcome and risks |
| source_of_truth | docs/workflow/PREFERENCES.md | Audit budget defaults |

## Upstream Refs

| Class | Ref | Why |
| --- | --- | --- |
| verify_only | scripts/workflow/doctor.js | Fast sync signal |
| verify_only | scripts/workflow/health.js | Strict gate |
| supporting | docs/workflow/WINDOW.md | Budget evidence |

## Success Contract

- `To be filled during research/planning for the next milestone`

## Acceptance Criteria

| Acceptance ID | Criterion | How to observe | Status |
| --- | --- | --- | --- |
| `AC0` | `Fill when a milestone opens` | `Describe the observable signal that proves this criterion` | `pending` |

## User-visible Outcomes

| Outcome | How to observe | Status |
| --- | --- | --- |
| `Fill when a milestone opens` | `Describe what the user should be able to see or do` | `pending` |

## Regression Focus

| Area | Risk | Check |
| --- | --- | --- |
| `Fill when a milestone opens` | `Document what could regress` | `Describe the regression-oriented check` |

## Verification Attachments

- `Optionally add VERIFICATION_BRIEF.md or TEST_SPEC.md when the milestone needs deeper verification planning`

## Validation Contract

| Deliverable | Verify command | Expected signal | Manual check | Golden | Audit owner | Status | Evidence | Packet hash |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `Workflow idle validation surface` | `node scripts/workflow/doctor.js --strict` | `0 fail` | `Idle workflow summary aligns with STATUS.md` | `tests/golden/workflow/README.md` | `audit` | `pending` | `docs/workflow/STATUS.md` | `pending_sync` |

## Unknowns

| Unknown | Impact | Owner | Status |
| --- | --- | --- | --- |
| `What the first active milestone validation contract should be` | `Validation rows will change` | `user` | `open` |

## What Would Falsify This Plan?

- `If the validation table keeps empty verify/manual/evidence columns, the audit contract is invalid`
- `If the packet hash stays stale, audit may close out against an outdated plan`

## Audit Notes

- `The starter scaffold is waiting until the first active milestone`

## Completion Gate

- `To be filled when the next milestone opens`
