# VALIDATION

- Last updated: `2026-04-03`
- Active milestone: `NONE`
- Validation status: `idle_until_milestone`
- Audit readiness: `not_ready`
- Frontend mode: `inactive`
- Frontend profile ref: `docs/workflow/FRONTEND_PROFILE.md`
- Frontend profile json: `.workflow/frontend-profile.json`
- Frontend adapter route: `react-best-practices`
- Visual verdict required: `no`
- Contract owner: `audit`
- Packet version: `5`
- Input hash: `e68105ec6f4f68f0a197a8263323e0734860d28c422a2fc7a01f138fbda1b831`
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

## Validation Core

- Acceptance criteria IDs: `AC0`
- Active validation IDs: `AC0`
- Primary verify command: `node scripts/workflow/doctor.js --strict`
- Validation status: `idle_until_milestone`
- Audit readiness: `not_ready`
- Evidence source: `docs/workflow/STATUS.md`

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

## Frontend Audit Mode
- `Frontend mode: inactive`
- `Activation reason: workflow_inactive`
- `Activation signals: none`
- `Design-system aware execution: no`
- `Adapter route: react-best-practices`
- `Preview/browser verification need: no`
- `Visual verdict required: no`

## Verification Attachments

- `Optionally add VERIFICATION_BRIEF.md or TEST_SPEC.md when the milestone needs deeper verification planning`

## Visual Verdict
| Verdict area | Expectation | How to observe | Evidence expectation | Status |
| --- | --- | --- | --- | --- |
| responsive | Desktop and mobile layouts preserve hierarchy without overflow or broken spacing. | Check at least one narrow and one wide viewport or documented responsive breakpoint. | Screenshot pair or browser-verify note. | optional |
| interaction | Primary interactions, states, and form behavior feel complete and predictable. | Exercise key clicks, navigation, hover/focus, and any milestone-specific UI state changes. | Manual check note, test output, or browser-verify trace. | optional |
| visual consistency | Typography, spacing, color, and motion stay coherent with the chosen UI system. | Review changed screens/components against the active design direction or design system. | Review note plus screenshot evidence when relevant. | optional |
| component reuse | UI changes reuse the existing design system or shared component surfaces instead of fragmenting them. | Inspect changed components and note whether shared primitives/components were used. | Diff review note referencing reused component surfaces. | optional |
| accessibility smoke | Basic semantic structure, focusability, labels, and contrast concerns are checked at smoke-test level. | Review obvious keyboard/label/semantic issues or run lightweight a11y checks when available. | Manual smoke note or tool output. | optional |
| screenshot evidence | At least one screenshot or equivalent visual artifact backs up the UI verdict when frontend mode is active. | Capture or reference a screenshot artifact for the changed view when practical. | Screenshot path, URL, or explicit note explaining why none was needed. | optional |

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
